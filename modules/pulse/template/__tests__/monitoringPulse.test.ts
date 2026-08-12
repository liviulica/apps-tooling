/**
 * The orchestrator. Its whole job is to never let one broken source take the
 * run down, and to never let a broken source look like a healthy zero.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  parseArgs,
  runPulse,
  snapshotPath,
  readPreviousSnapshot,
  crashesFromFile,
} from '../scripts/monitoring/pulse';
import {ok, missing, unavailable, parseWindow} from '../scripts/monitoring/config';

const WINDOW = parseWindow('7d', new Date('2026-08-12T00:00:00Z'));

function stubSources(overrides: Record<string, unknown> = {}) {
  return {
    crashes: async () => unavailable('needs the Firebase MCP server'),
    reviews: async () => ok({reviews: missing('none')}),
    amplitude: async () => ok({activation: ok({counts: [1]})}),
    revenue: async () => ok({overview: ok({mrr: 10})}),
    supabase: async () => ok({accounts: ok({total: 9})}),
    ...overrides,
  };
}

describe('parseArgs', () => {
  it('reads a positional source list', () => {
    expect(parseArgs(['revenue,crashes']).only).toEqual(['revenue', 'crashes']);
  });

  it('reads --only, and defaults to every source', () => {
    expect(parseArgs(['--only', 'supabase']).only).toEqual(['supabase']);
    expect(parseArgs([]).only).toBeNull();
  });

  it('rejects a source that does not exist rather than running four of five silently', () => {
    expect(() => parseArgs(['crashes,revenu'])).toThrow(/revenu/);
  });

  it('reads the window, the flags and the crash handoff file', () => {
    const args = parseArgs(['--since', '30d', '--dashboard', '--json', '--crashes-from', '/tmp/c.json']);
    expect(args.since).toBe('30d');
    expect(args.dashboard).toBe(true);
    expect(args.json).toBe(true);
    expect(args.crashesFrom).toBe('/tmp/c.json');
  });
});

describe('runPulse', () => {
  it('runs only the sources asked for', async () => {
    const snapshot = await runPulse({
      env: {},
      window: WINDOW,
      only: ['revenue', 'supabase'],
      sources: stubSources(),
    });
    expect(Object.keys(snapshot.sources).sort()).toEqual(['revenue', 'supabase']);
  });

  it('turns a thrown source into unavailable rather than aborting the run', async () => {
    const snapshot = await runPulse({
      env: {},
      window: WINDOW,
      sources: stubSources({
        revenue: async () => {
          throw new Error('socket hang up');
        },
      }),
    });
    expect(snapshot.sources.revenue.status).toBe('unavailable');
    expect(snapshot.sources.revenue.reason).toContain('socket hang up');
    expect(snapshot.sources.supabase.status).toBe('ok');
  });

  it('produces five unavailable sources and no thrown error when nothing is configured', async () => {
    // The REAL source modules run here. Only the two boundaries are faked:
    // HTTP and the Supabase CLI. That is the difference between proving the
    // orchestrator degrades honestly and proving that stubs return stubs.
    const snapshot = await runPulse({
      env: {},
      window: WINDOW,
      fetchImpl: async () => {
        throw new Error('offline');
      },
      execImpl: () => {
        throw new Error('command not found: supabase');
      },
    });
    expect(Object.keys(snapshot.sources)).toHaveLength(5);
    const sources = Object.values(snapshot.sources) as Array<{status: string; reason: string}>;
    const statuses = sources.map(s => s.status);
    expect(statuses).toEqual([
      'unavailable',
      'unavailable',
      'unavailable',
      'unavailable',
      'unavailable',
    ]);
    for (const source of sources) {
      expect(typeof source.reason).toBe('string');
      expect(source.reason.length).toBeGreaterThan(0);
    }
  });

  it('stamps the window and a schema version', async () => {
    const snapshot = await runPulse({env: {}, window: WINDOW, sources: stubSources()});
    expect(snapshot.version).toBe(1);
    expect(snapshot.window).toEqual({
      days: 7,
      since: WINDOW.since.toISOString(),
      until: WINDOW.until.toISOString(),
    });
    expect(typeof snapshot.generatedAt).toBe('string');
  });

  it('accepts a crashes block gathered outside the script', async () => {
    const snapshot = await runPulse({
      env: {},
      window: WINDOW,
      sources: stubSources(),
      crashes: ok({topIssues: [{title: 'RangeError', events: 4}]}),
    });
    expect(snapshot.sources.crashes.status).toBe('ok');
    expect(snapshot.sources.crashes.data.topIssues[0].title).toBe('RangeError');
  });
});

describe('crashesFromFile', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-crashes-'));

  it('is unavailable when the handoff file is not there', () => {
    expect(crashesFromFile(path.join(dir, 'nope.json')).status).toBe('unavailable');
  });

  it('is missing when the agent reports no crashes, which is a real answer', () => {
    const file = path.join(dir, 'empty.json');
    fs.writeFileSync(file, JSON.stringify({topIssues: []}));
    expect(crashesFromFile(file).status).toBe('missing');
  });

  it('is ok when the agent found issues', () => {
    const file = path.join(dir, 'full.json');
    fs.writeFileSync(file, JSON.stringify({topIssues: [{title: 'TypeError', events: 2}]}));
    const result = crashesFromFile(file);
    expect(result.status).toBe('ok');
    expect(result.data.topIssues).toHaveLength(1);
  });

  it('is unavailable, not a crash, when the file is not valid JSON', () => {
    const file = path.join(dir, 'bad.json');
    fs.writeFileSync(file, 'not json');
    expect(crashesFromFile(file).status).toBe('unavailable');
  });
});

describe('snapshots on disk', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-root-'));

  it('names a snapshot by its UTC day', () => {
    expect(snapshotPath(root, new Date('2026-08-12T23:00:00Z'))).toBe(
      path.join(root, 'monitoring', 'snapshots', '2026-08-12.json'),
    );
  });

  it('returns null when there is no previous snapshot, rather than throwing', () => {
    expect(readPreviousSnapshot(root, new Date('2026-08-12T00:00:00Z'))).toBeNull();
  });

  it('finds the most recent snapshot before today', () => {
    const dir = path.join(root, 'monitoring', 'snapshots');
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(path.join(dir, '2026-08-01.json'), JSON.stringify({version: 1, marker: 'old'}));
    fs.writeFileSync(path.join(dir, '2026-08-09.json'), JSON.stringify({version: 1, marker: 'recent'}));
    fs.writeFileSync(path.join(dir, '2026-08-12.json'), JSON.stringify({version: 1, marker: 'today'}));
    const previous = readPreviousSnapshot(root, new Date('2026-08-12T00:00:00Z'));
    expect(previous.marker).toBe('recent');
  });
});
