'use strict';
/* eslint-env node */

/**
 * Amplitude Dashboard REST API.
 *
 * THE HOST IS LOAD BEARING. This project's data region is EU
 * (EXPO_PUBLIC_AMPLITUDE_SERVER_ZONE=EU in .env), and the US host answers a
 * request for an EU project with HTTP 200 and an empty result set. There is
 * no error to notice: every funnel simply reads zero. So EU is the default
 * here and the US host has to be asked for by name.
 *
 * Four blocks, each failing independently: activation, monetization,
 * engagement, health. Retention is deliberately absent for now, see the note
 * on fetchRetention below.
 */

const {ok, unavailable, requireEnv, REQUIRED_ENV, summariseReasons} = require('../config');
const {conversion} = require('../metrics');
const {
  ACTIVATION_FUNNEL,
  MONETIZATION_FUNNEL,
  ENGAGEMENT_EVENTS,
  HEALTH_EVENTS,
} = require('../events');

const EU_HOST = 'https://analytics.eu.amplitude.com';
const US_HOST = 'https://amplitude.com';

/** The dashboard API only accepts YYYYMMDD, in the project's own timezone. */
function amplitudeDay(date) {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

function hostFor(env) {
  return (env.AMPLITUDE_SERVER_ZONE || 'EU').toUpperCase() === 'US' ? US_HOST : EU_HOST;
}

/**
 * Amplitude puts the useful half of a failure in `error.metadata.details`,
 * and the difference between two of those strings IS the diagnosis:
 *
 *   "Invalid API/Secret Key combination"  the host knows this API key, but
 *                                         the secret belongs to another
 *                                         project
 *   "Invalid API Key"                     this host has never seen the key,
 *                                         so you are on the wrong region
 *
 * Reporting only "HTTP 403" hides both, and cost a separate debugging script
 * the first time these credentials were wired up.
 */
async function failureInfo(response) {
  try {
    const body = await response.json();
    const error = (body && body.error) || {};
    return {
      message: error.message || '',
      detail: error.metadata && error.metadata.details ? error.metadata.details : error.message || '',
    };
  } catch (e) {
    return {message: '', detail: ''};
  }
}

async function amplitudeGet(fetchImpl, auth, url) {
  const response = await fetchImpl(url, {headers: {Authorization: auth, Accept: 'application/json'}});
  if (!response.ok) {
    const {message, detail} = await failureInfo(response);
    const error = new Error(`Amplitude HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
    /**
     * Amplitude answers 400 "Invalid chart definition" (details "Invalid
     * <event name>") for an event it has NEVER received, in this project, at
     * any time. That is an answer, not a failure, and it is a useful one: an
     * event that exists in lib/analytics/events.ts but has never reached
     * Amplitude is either a code path nobody hits or instrumentation that is
     * not wired up. Callers turn this into a real zero plus a note.
     */
    // @ts-ignore adding a flag to an Error is deliberate
    error.unknownEvent = response.status === 400 && /invalid chart definition/i.test(message);
    throw error;
  }
  return response.json();
}

/** `e=` parameters are JSON, one per funnel step, in order. */
function eventParams(names) {
  return names.map(name => `e=${encodeURIComponent(JSON.stringify({event_type: name}))}`).join('&');
}

async function fetchFunnel({fetchImpl, auth, host, window, steps}) {
  const url =
    `${host}/api/2/funnels?${eventParams(steps)}` +
    `&start=${amplitudeDay(window.since)}&end=${amplitudeDay(window.until)}&mode=ordered`;
  const body = await amplitudeGet(fetchImpl, auth, url);
  const series = (body.data && body.data[0]) || {};
  const counts = series.cumulativeRaw || series.cumulative || [];
  return ok({steps, counts, conversion: conversion(counts)});
}

/**
 * One segmentation call per event, totalled over the window. Amplitude
 * returns a series per day; the report wants the window total.
 */
async function fetchEventTotals({fetchImpl, auth, host, window, names}) {
  const counts = {};
  const neverSeen = [];
  const failures = [];
  for (const name of names) {
    const url =
      `${host}/api/2/events/segmentation?e=${encodeURIComponent(JSON.stringify({event_type: name}))}` +
      `&start=${amplitudeDay(window.since)}&end=${amplitudeDay(window.until)}&m=totals&i=1`;
    try {
      const body = await amplitudeGet(fetchImpl, auth, url);
      const series = (body.data && body.data.series) || [];
      counts[name] = series.reduce(
        (sum, points) => sum + points.reduce((inner, value) => inner + (Number(value) || 0), 0),
        0,
      );
    } catch (e) {
      // An event Amplitude has never received really did happen zero times.
      // Recording it as null would print "not measured" beside events that
      // reported numbers, which reads as a broken query rather than as the
      // finding it is.
      if (e.unknownEvent) {
        counts[name] = 0;
        neverSeen.push(name);
        continue;
      }
      // One bad event name must not cost the others their numbers.
      counts[name] = null;
      failures.push([name, e.message]);
    }
  }
  if (Object.values(counts).every(value => value === null)) {
    return unavailable(failures.length ? summariseReasons(failures) : 'no events answered');
  }
  return ok({counts, neverSeen});
}

/**
 * @param {{env?: Record<string, string>, window: import('../config').Window,
 *          fetchImpl?: Function, execImpl?: Function}} context
 * @returns {Promise<import('../config').SourceResult>}
 */
async function fetchAmplitude({env, window, fetchImpl}) {
  const fetcher = fetchImpl || fetch;
  const credentials = requireEnv(env || {}, REQUIRED_ENV.amplitude);
  if (!credentials.ok) {
    return unavailable(credentials.reason);
  }

  const auth = `Basic ${Buffer.from(`${env.AMPLITUDE_API_KEY}:${env.AMPLITUDE_SECRET_KEY}`).toString('base64')}`;
  const host = hostFor(env);
  const common = {fetchImpl: fetcher, auth, host, window};

  const activation = await fetchFunnel({...common, steps: ACTIVATION_FUNNEL}).catch(e =>
    unavailable(e.message),
  );
  const monetization = await fetchFunnel({...common, steps: MONETIZATION_FUNNEL}).catch(e =>
    unavailable(e.message),
  );
  const engagement = await fetchEventTotals({...common, names: ENGAGEMENT_EVENTS}).catch(e =>
    unavailable(e.message),
  );
  const health = await fetchEventTotals({...common, names: HEALTH_EVENTS}).catch(e =>
    unavailable(e.message),
  );

  const blocks = {activation, monetization, engagement, health};
  const answered = Object.values(blocks).some(block => block.status !== 'unavailable');
  if (!answered) {
    return {
      ...unavailable(summariseReasons(Object.entries(blocks).map(([name, block]) => [name, block.reason]))),
      data: blocks,
    };
  }
  return ok(blocks);
}

module.exports = {fetchAmplitude, amplitudeDay, hostFor, EU_HOST, US_HOST};
