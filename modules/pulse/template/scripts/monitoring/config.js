'use strict';

/**
 * Shared plumbing for the monitoring pulse: the three-state contract, the
 * credential file, the time window, and the source registry.
 *
 * THE THREE STATES ARE THE POINT. A source resolves to exactly one of:
 *
 *   ok           it answered and there is data
 *   missing      it answered and there is genuinely nothing (no crashes yet)
 *   unavailable  it could not answer (no credential, 4xx, 5xx, timeout)
 *
 * `unavailable` must never render as a zero. "0 crashes" and "could not reach
 * Crashlytics" look identical in a naive implementation, and the first one
 * reads as good news. src/data/dictionary.ts learned this the expensive way
 * for word lookups; this is the same rule for telemetry.
 *
 * CommonJS on purpose: jest here is ts-jest in CommonJS with
 * moduleFileExtensions that lacks `mjs`, so an ESM module would be
 * unreachable from any test. Node 26 runs this directly either way.
 */

const fs = require('fs');
const path = require('path');

/**
 * The one shape every source and every block inside a source returns.
 *
 * `data` is present only on ok, `reason` only on missing and unavailable, but
 * they are declared together on purpose: a discriminated union would force
 * every consumer to narrow before reading either, and consumers here are
 * renderers that check `.status` themselves.
 *
 * @typedef {{status: 'ok' | 'missing' | 'unavailable', data?: any, reason?: string}} SourceResult
 */

/**
 * The window a run covers.
 * @typedef {{days: number, since: Date, until: Date}} Window
 */

/** The credential file. Gitignored AND excluded from EAS uploads by `.env.*.local`. */
const ENV_FILE = '.env.monitoring.local';

/**
 * Every source, in report order. The slash command and the setup doc are both
 * tested against this list, so a new source cannot ship without a door.
 */
const SOURCES = ['crashes', 'reviews', 'amplitude', 'revenue', 'supabase'];

/**
 * Credentials each source needs from ENV_FILE. Empty means it authenticates
 * some other way: `crashes` goes through the Firebase MCP server (firebase
 * login), `supabase` through the logged-in Supabase CLI.
 */
/** @type {Record<string, string[]>} */
const REQUIRED_ENV = {
  crashes: [],
  reviews: ['ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_P8_PATH'],
  amplitude: ['AMPLITUDE_API_KEY', 'AMPLITUDE_SECRET_KEY'],
  revenue: ['REVENUECAT_SECRET_KEY', 'REVENUECAT_PROJECT_ID'],
  supabase: [],
};

/**
 * Every variable the setup doc has to explain, required or not. Optional ones
 * disable one BLOCK of a source rather than the whole source: without
 * ASC_VENDOR_NUMBER there are no sales figures, but reviews still arrive.
 */
const ENV_TEMPLATE = [
  'ASC_KEY_ID',
  'ASC_ISSUER_ID',
  'ASC_P8_PATH',
  'ASC_VENDOR_NUMBER',
  'AMPLITUDE_API_KEY',
  'AMPLITUDE_SECRET_KEY',
  'REVENUECAT_SECRET_KEY',
  'REVENUECAT_PROJECT_ID',
];

/**
 * The app's own identifiers live in app-config.js (APP-OWNED, never
 * overwritten on re-sync) and are re-exported here so every source imports
 * from one place. They are public identifiers, not secrets, which is why they
 * are committed rather than kept in the env file.
 */
const {
  APP_STORE_APP_ID,
  BUNDLE_ID,
  FIREBASE_PROJECT_ID,
  SUPABASE_PROJECT_REF,
  RATING_STOREFRONTS,
} = require('./app-config');

/** @param {any} [data] @returns {SourceResult} */
function ok(data) {
  return {status: 'ok', data};
}

/** @param {string} reason @returns {SourceResult} */
function missing(reason) {
  return {status: 'missing', reason};
}

/** @param {string} reason @returns {SourceResult} */
function unavailable(reason) {
  return {status: 'unavailable', reason};
}

/**
 * Read KEY=value pairs. A missing file is not an error: it makes the sources
 * that need it `unavailable` with a reason, which is the honest outcome.
 */
/** @param {string} file @returns {Record<string, string>} */
function loadEnv(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (e) {
    return {};
  }
  const env = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (eq === -1) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key) {
      env[key] = value;
    }
  }
  return env;
}

/** Default location of the credential file, relative to the repo root. */
/** @param {string} [root] */
function envPath(root) {
  return path.join(root || path.join(__dirname, '..', '..'), ENV_FILE);
}

/**
 * Report the FIRST thing that is missing by name, so the reason string can be
 * followed straight into docs/monitoring-setup.md.
 */
/**
 * @param {Record<string, string>} env
 * @param {string[]} names
 * @returns {{ok: boolean, reason?: string}}
 */
function requireEnv(env, names) {
  const absent = names.filter(name => !env[name]);
  if (absent.length === 0) {
    return {ok: true};
  }
  return {
    ok: false,
    reason: `not configured: ${absent.join(', ')} missing from ${ENV_FILE} (see docs/monitoring-setup.md)`,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** '7d' -> an inclusive [since, until] range ending now. */
/** @param {string} [spec] @param {Date} [now] @returns {Window} */
function parseWindow(spec, now) {
  const until = now ? new Date(now.getTime()) : new Date();
  const match = /^(\d+)d$/.exec(spec || '7d');
  const days = match ? Number(match[1]) : 0;
  if (!days) {
    throw new Error(`invalid window "${spec}", expected a day count like 7d`);
  }
  return {days, since: new Date(until.getTime() - days * DAY_MS), until};
}

/**
 * Join several block failures into one reason, saying a SHARED cause once.
 *
 * When every block failed for the same reason (one bad credential usually
 * fails all of them), naming each block just buries the sentence that
 * matters. The first live Amplitude run printed "Invalid API/Secret Key
 * combination" eleven times in a single line.
 *
 * @param {Array<[string, string]>} named pairs of block name and its reason
 * @returns {string}
 */
function summariseReasons(named) {
  const unique = [...new Set(named.map(([, reason]) => reason))];
  if (unique.length === 1) {
    return unique[0];
  }
  return named.map(([name, reason]) => `${name}: ${reason}`).join(' | ');
}

/** YYYY-MM-DD in UTC, the key every snapshot file is named by. */
function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

module.exports = {
  ENV_FILE,
  SOURCES,
  REQUIRED_ENV,
  ENV_TEMPLATE,
  APP_STORE_APP_ID,
  BUNDLE_ID,
  FIREBASE_PROJECT_ID,
  SUPABASE_PROJECT_REF,
  RATING_STOREFRONTS,
  ok,
  missing,
  unavailable,
  loadEnv,
  envPath,
  requireEnv,
  parseWindow,
  summariseReasons,
  isoDay,
};
