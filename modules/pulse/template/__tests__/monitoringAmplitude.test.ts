/**
 * Amplitude. Two things can go wrong quietly here and both are covered:
 * querying an event name that no longer exists (a flat funnel that looks like
 * a product problem), and talking to the US host when the project is EU
 * (empty results, HTTP 200, no error anywhere).
 */
import fs from 'fs';
import path from 'path';
import {fetchAmplitude, amplitudeDay} from '../scripts/monitoring/sources/amplitude';
import {
  ACTIVATION_FUNNEL,
  MONETIZATION_FUNNEL,
  ENGAGEMENT_EVENTS,
  HEALTH_EVENTS,
  RETENTION_EVENT,
} from '../scripts/monitoring/events';

const WINDOW = {
  days: 7,
  since: new Date('2026-08-05T00:00:00Z'),
  until: new Date('2026-08-12T00:00:00Z'),
};

const ENV = {AMPLITUDE_API_KEY: 'key123', AMPLITUDE_SECRET_KEY: 'secret456'};

function fakeFetch(responder: (url: string) => {status?: number; body?: unknown}) {
  const calls: Array<{url: string; headers: Record<string, string>}> = [];
  const impl = async (url: string, init: {headers?: Record<string, string>} = {}) => {
    calls.push({url, headers: init.headers || {}});
    const {status = 200, body = {}} = responder(url);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  };
  return {impl, calls};
}

const FUNNEL_BODY = {data: [{cumulativeRaw: [100, 40, 12, 9, 7], events: ['a', 'b', 'c', 'd', 'e']}]};
const SEGMENTATION_BODY = {data: {series: [[3, 4, 5]], seriesLabels: ['x'], xValues: ['2026-08-10']}};
const RETENTION_BODY = {data: {}};

describe('the event-name guard', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'lib', 'analytics', 'events.ts'),
    'utf8',
  );
  // Only the AnalyticsEvent union, not the other string unions in the file.
  // Sliced to the next top-level `export`, NOT to the first semicolon: one of
  // the comments inside the union contains a semicolon ("Account section;
  // Completed"), which cut the block off after 25 of its members and made the
  // guard pass over events it had never seen.
  const start = source.indexOf('export type AnalyticsEvent =');
  const block = source.slice(start, source.indexOf('\nexport ', start + 1));
  const union = new Set([...block.matchAll(/\|\s*'([^']+)'/g)].map(m => m[1]));

  it('found a union to check against', () => {
    expect(union.size).toBeGreaterThan(50);
    expect(union.has('Paywall Viewed')).toBe(true);
  });

  it('only queries events that still exist in the typed union', () => {
    const queried = [
      ...ACTIVATION_FUNNEL,
      ...MONETIZATION_FUNNEL,
      ...ENGAGEMENT_EVENTS,
      ...HEALTH_EVENTS,
      RETENTION_EVENT,
    ];
    const drifted = queried.filter(name => !union.has(name));
    expect(drifted).toEqual([]);
  });
});

describe('fetchAmplitude credentials', () => {
  it('is unavailable and names the variables when the secret key is absent', async () => {
    const {impl} = fakeFetch(() => ({body: FUNNEL_BODY}));
    const result = await fetchAmplitude({env: {}, window: WINDOW, fetchImpl: impl});
    expect(result.status).toBe('unavailable');
    expect(result.reason).toContain('AMPLITUDE_SECRET_KEY');
  });

  it('authenticates with Basic key:secret', async () => {
    const {impl, calls} = fakeFetch(() => ({body: FUNNEL_BODY}));
    await fetchAmplitude({env: ENV, window: WINDOW, fetchImpl: impl});
    const expected = `Basic ${Buffer.from('key123:secret456').toString('base64')}`;
    expect(calls[0].headers.Authorization).toBe(expected);
  });
});

describe('the EU host', () => {
  it('talks to analytics.eu.amplitude.com, because this project is EU', async () => {
    const {impl, calls} = fakeFetch(() => ({body: FUNNEL_BODY}));
    await fetchAmplitude({env: ENV, window: WINDOW, fetchImpl: impl});
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call.url).toContain('analytics.eu.amplitude.com');
    }
  });

  it('can be pointed at the US host explicitly, and never silently', async () => {
    const {impl, calls} = fakeFetch(() => ({body: FUNNEL_BODY}));
    await fetchAmplitude({
      env: {...ENV, AMPLITUDE_SERVER_ZONE: 'US'},
      window: WINDOW,
      fetchImpl: impl,
    });
    expect(calls[0].url).toContain('amplitude.com/api/2');
    expect(calls[0].url).not.toContain('analytics.eu');
  });
});

describe('amplitudeDay', () => {
  it('formats as YYYYMMDD, which is the only format the dashboard API accepts', () => {
    expect(amplitudeDay(new Date('2026-08-05T22:00:00Z'))).toBe('20260805');
  });
});

describe('fetchAmplitude results', () => {
  it('shapes a funnel into steps with step-to-step conversion', async () => {
    const {impl} = fakeFetch(url =>
      url.includes('/funnels') ? {body: FUNNEL_BODY} : {body: SEGMENTATION_BODY},
    );
    const result = await fetchAmplitude({env: ENV, window: WINDOW, fetchImpl: impl});
    expect(result.status).toBe('ok');
    const activation = result.data.activation.data;
    expect(activation.counts).toEqual([100, 40, 12, 9, 7]);
    expect(activation.conversion[1]).toBeCloseTo(0.4);
    expect(activation.steps[0]).toBe('App Opened');
  });

  it('reads a 429 as unavailable, never as an empty funnel', async () => {
    const {impl} = fakeFetch(url =>
      url.includes('/funnels') ? {status: 429, body: {}} : {body: SEGMENTATION_BODY},
    );
    const result = await fetchAmplitude({env: ENV, window: WINDOW, fetchImpl: impl});
    expect(result.data.activation.status).toBe('unavailable');
    expect(result.data.activation.reason).toContain('429');
  });

  it('sums segmentation series into a per-event total', async () => {
    const {impl} = fakeFetch(url =>
      url.includes('/funnels') ? {body: FUNNEL_BODY} : {body: SEGMENTATION_BODY},
    );
    const result = await fetchAmplitude({env: ENV, window: WINDOW, fetchImpl: impl});
    expect(result.data.engagement.data.counts['Book Finished']).toBe(12);
    expect(result.data.engagement.data.neverSeen).toEqual([]);
  });

  it('treats an event Amplitude has never received as a real zero, and names it', async () => {
    // This is the live 400 for an event that has never arrived, verified
    // 2026-08-12 against 'Sync Retried'. Reporting it as "not measured" beside
    // events that answered reads as a broken query rather than as the finding
    // it is: the code path never runs, or the instrumentation is dead.
    const {impl} = fakeFetch(url => {
      if (url.includes('/funnels')) {
        return {body: FUNNEL_BODY};
      }
      if (url.includes(encodeURIComponent('Sync Retried'))) {
        return {
          status: 400,
          body: {error: {http_code: 400, message: 'Invalid chart definition', metadata: {details: 'Invalid Sync Retried'}}},
        };
      }
      return {body: SEGMENTATION_BODY};
    });
    const result = await fetchAmplitude({env: ENV, window: WINDOW, fetchImpl: impl});
    expect(result.data.health.status).toBe('ok');
    expect(result.data.health.data.counts['Sync Retried']).toBe(0);
    expect(result.data.health.data.neverSeen).toContain('Sync Retried');
    expect(result.data.health.data.counts['Sync Completed']).toBe(12);
  });

  it("surfaces Amplitude's own explanation, because a status code is not a diagnosis", async () => {
    // These two strings are what the live API actually returns, and telling
    // them apart is the whole diagnosis: a mismatched key pair versus the
    // wrong data region.
    const {impl} = fakeFetch(() => ({
      status: 403,
      body: {error: {http_code: 403, metadata: {details: 'Invalid API/Secret Key combination'}}},
    }));
    const result = await fetchAmplitude({env: ENV, window: WINDOW, fetchImpl: impl});
    expect(result.reason).toContain('Invalid API/Secret Key combination');
  });

  it('is unavailable overall only when every block failed', async () => {
    const {impl} = fakeFetch(() => ({status: 500, body: {}}));
    const result = await fetchAmplitude({env: ENV, window: WINDOW, fetchImpl: impl});
    expect(result.status).toBe('unavailable');
  });
});
