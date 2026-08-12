#!/usr/bin/env node
'use strict';

/**
 * /pulse — pull every monitoring source into one dated snapshot.
 *
 *   node scripts/monitoring/pulse.js [sources] [--since 7d] [--json]
 *                                    [--crashes-from file.json] [--dashboard]
 *
 * Sources: crashes, reviews, amplitude, revenue, supabase. Naming any subset
 * runs only those.
 *
 * CRASHES ARE THE ODD ONE. Crashlytics has no public REST read API, so this
 * script cannot fetch them. The /pulse slash command gathers them through
 * the Firebase MCP server, writes them to a JSON file, and passes it with
 * --crashes-from. Run without that file, the crashes source is `unavailable`
 * with a reason saying so, which is honest: no data was gathered.
 *
 * Nothing here ever throws its way out of a source. A source that fails
 * becomes `unavailable` with a reason, and the other four still report.
 */

const fs = require('fs');
const path = require('path');
const {
  SOURCES,
  ENV_FILE,
  ok,
  missing,
  unavailable,
  loadEnv,
  envPath,
  parseWindow,
  isoDay,
} = require('./config');
const {fetchAppStore} = require('./sources/appstore');
const {fetchAmplitude} = require('./sources/amplitude');
const {fetchRevenueCat} = require('./sources/revenuecat');
const {fetchSupabase} = require('./sources/supabase');

/** Bump when the snapshot shape changes in a way a reader has to know about. */
const SNAPSHOT_VERSION = 1;

const REPO_ROOT = path.join(__dirname, '..', '..');

const DEFAULT_SOURCES = {
  crashes: async () =>
    unavailable(
      'Crashlytics has no REST read API. /pulse gathers it through the Firebase MCP server ' +
        'and passes it with --crashes-from; run bare, nothing was gathered.',
    ),
  reviews: async ctx => fetchAppStore(ctx),
  amplitude: async ctx => fetchAmplitude(ctx),
  revenue: async ctx => fetchRevenueCat(ctx),
  supabase: async ctx => fetchSupabase(ctx),
};

function parseArgs(argv) {
  const args = {only: null, since: '7d', dashboard: false, json: false, crashesFrom: null, write: true};
  const rest = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--only') {
      rest.push(argv[++i]);
    } else if (arg === '--since') {
      args.since = argv[++i];
    } else if (arg === '--crashes-from') {
      args.crashesFrom = argv[++i];
    } else if (arg === '--dashboard') {
      args.dashboard = true;
    } else if (arg === '--json') {
      args.json = true;
    } else if (arg === '--no-write') {
      args.write = false;
    } else if (!arg.startsWith('-')) {
      rest.push(arg);
    } else {
      throw new Error(`unknown flag ${arg}`);
    }
  }

  const named = rest
    .filter(Boolean)
    .flatMap(value => value.split(','))
    .map(value => value.trim())
    .filter(Boolean);

  if (named.length) {
    // A typo must be loud. Running four of five sources and reporting
    // "everything is fine" is the failure this whole design guards against.
    const unknown = named.filter(name => !SOURCES.includes(name));
    if (unknown.length) {
      throw new Error(`unknown source(s): ${unknown.join(', ')}. Known: ${SOURCES.join(', ')}`);
    }
    args.only = named;
  }

  return args;
}

/** Where a day's snapshot lives. UTC day, so a late-night run does not overwrite the morning's. */
function snapshotPath(root, date) {
  return path.join(root, 'monitoring', 'snapshots', `${isoDay(date)}.json`);
}

/** The most recent snapshot STRICTLY before today, which is what deltas compare against. */
function readPreviousSnapshot(root, date) {
  const dir = path.join(root, 'monitoring', 'snapshots');
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch (e) {
    return null;
  }
  const today = `${isoDay(date)}.json`;
  const earlier = names
    .filter(name => name.endsWith('.json') && name < today)
    .sort();
  if (!earlier.length) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, earlier[earlier.length - 1]), 'utf8'));
  } catch (e) {
    return null;
  }
}

/**
 * The agent's Crashlytics handoff. An unreadable or unparseable file is
 * `unavailable`, never an empty crash list: "no crashes" has to be something
 * Crashlytics said, not something a missing file implied.
 */
/** @param {string} file @returns {import('./config').SourceResult} */
function crashesFromFile(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (e) {
    return unavailable(`crash handoff file unreadable (${file}): ${e.code || e.message}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return unavailable(`crash handoff file is not valid JSON (${file})`);
  }
  const issues = parsed.topIssues || [];
  if (!issues.length) {
    return missing('Crashlytics reported no issues in this window');
  }
  return ok(parsed);
}

/**
 * @param {{env?: Record<string, string>, window: import('./config').Window,
 *          only?: string[] | null, sources?: Record<string, Function>,
 *          previous?: any, crashes?: import('./config').SourceResult | null,
 *          fetchImpl?: Function, execImpl?: Function}} options
 * @returns {Promise<any>}
 */
async function runPulse({env, window, only, sources, previous, crashes, fetchImpl, execImpl}) {
  const registry = sources || DEFAULT_SOURCES;
  const selected = only && only.length ? only : SOURCES;
  // fetchImpl and execImpl are the two boundaries: HTTP and the Supabase CLI.
  // Tests inject them so the real source modules run for real, with only the
  // outside world faked.
  const context = {env: env || {}, window, fetchImpl, execImpl};

  const results = await Promise.all(
    selected.map(async id => {
      if (id === 'crashes' && crashes) {
        return [id, crashes];
      }
      const fetcher = registry[id];
      if (!fetcher) {
        return [id, unavailable(`no fetcher registered for "${id}"`)];
      }
      try {
        return [id, await fetcher(context)];
      } catch (e) {
        return [id, unavailable(e.message || String(e))];
      }
    }),
  );

  return {
    version: SNAPSHOT_VERSION,
    generatedAt: new Date().toISOString(),
    window: {
      days: window.days,
      since: window.since.toISOString(),
      until: window.until.toISOString(),
    },
    previousDate: previous && previous.generatedAt ? previous.generatedAt.slice(0, 10) : null,
    sources: Object.fromEntries(results),
  };
}

async function main(argv) {
  const args = parseArgs(argv);
  const window = parseWindow(args.since);
  const env = loadEnv(envPath(REPO_ROOT));
  const previous = readPreviousSnapshot(REPO_ROOT, window.until);
  const crashes = args.crashesFrom ? crashesFromFile(args.crashesFrom) : null;

  const snapshot = await runPulse({env, window, only: args.only, previous, crashes});

  if (args.write) {
    const file = snapshotPath(REPO_ROOT, window.until);
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, JSON.stringify(snapshot, null, 2));
    snapshot.savedTo = path.relative(REPO_ROOT, file);
  }

  if (args.json) {
    process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
    return snapshot;
  }

  const {renderReport} = require('./render');
  const report = renderReport(snapshot, previous);
  process.stdout.write(`${report}\n`);

  if (args.write) {
    const reportFile = path.join(REPO_ROOT, 'monitoring', 'reports', `${isoDay(window.until)}.md`);
    fs.mkdirSync(path.dirname(reportFile), {recursive: true});
    fs.writeFileSync(reportFile, report);
    process.stdout.write(`\nSaved ${path.relative(REPO_ROOT, reportFile)}\n`);
  }

  if (args.dashboard) {
    const {renderDashboard} = require('./dashboard');
    const htmlFile = path.join(REPO_ROOT, 'monitoring', 'reports', `${isoDay(window.until)}.html`);
    fs.writeFileSync(htmlFile, renderDashboard(snapshot, previous));
    process.stdout.write(`Saved ${path.relative(REPO_ROOT, htmlFile)}\n`);
  }

  return snapshot;
}

if (require.main === module) {
  main(process.argv.slice(2)).catch(e => {
    process.stderr.write(`pulse failed: ${e.message}\n`);
    process.stderr.write(`If this is a credential problem, see docs/monitoring-setup.md and ${ENV_FILE}.\n`);
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  runPulse,
  snapshotPath,
  readPreviousSnapshot,
  crashesFromFile,
  main,
  SNAPSHOT_VERSION,
  DEFAULT_SOURCES,
};
