/**
 * The three-state contract every monitoring source obeys.
 *
 * `missing` and `unavailable` are the whole point: a source that could not
 * answer is not a source that answered zero. Collapsing them is how a
 * monitoring tool reports "0 crashes" during an outage. Same lesson as
 * src/data/dictionary.ts, one layer up.
 */
import {
  ok,
  missing,
  unavailable,
  loadEnv,
  requireEnv,
  parseWindow,
  summariseReasons,
  SOURCES,
  REQUIRED_ENV,
  ENV_FILE,
} from '../scripts/monitoring/config';
import fs from 'fs';
import os from 'os';
import path from 'path';

describe('three-state contract', () => {
  it('distinguishes an empty answer from no answer', () => {
    expect(ok([]).status).toBe('ok');
    expect(missing('no reviews yet').status).toBe('missing');
    expect(unavailable('HTTP 503').status).toBe('unavailable');
    expect(unavailable('HTTP 503').reason).toBe('HTTP 503');
  });

  it('carries data only on ok', () => {
    expect(ok({a: 1}).data).toEqual({a: 1});
    expect(missing('none').data).toBeUndefined();
    expect(unavailable('nope').data).toBeUndefined();
  });
});

describe('requireEnv', () => {
  it('names the missing variable and the file it belongs in', () => {
    const r = requireEnv({A: '1'}, ['A', 'B']);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('B');
    expect(r.reason).toContain(ENV_FILE);
  });

  it('treats an empty string as absent', () => {
    expect(requireEnv({A: ''}, ['A']).ok).toBe(false);
  });

  it('passes when every name is set', () => {
    expect(requireEnv({A: '1', B: '2'}, ['A', 'B'])).toEqual({ok: true});
  });
});

describe('loadEnv', () => {
  it('returns an empty object when the file does not exist, rather than throwing', () => {
    expect(loadEnv(path.join(os.tmpdir(), 'definitely-not-here-9f3a.env'))).toEqual({});
  });

  it('parses KEY=value, skipping blanks and comments', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-')), '.env.monitoring.local');
    fs.writeFileSync(
      file,
      ['# a comment', '', 'ASC_KEY_ID=ABC123', 'AMPLITUDE_SECRET_KEY = shh ', 'BROKEN'].join('\n'),
    );
    expect(loadEnv(file)).toEqual({ASC_KEY_ID: 'ABC123', AMPLITUDE_SECRET_KEY: 'shh'});
  });

  it('keeps = inside a value', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-')), 'env');
    fs.writeFileSync(file, 'K=a=b=c\n');
    expect(loadEnv(file).K).toBe('a=b=c');
  });
});

describe('parseWindow', () => {
  const now = new Date('2026-08-12T00:00:00Z');

  it('parses a day count into an inclusive range', () => {
    const w = parseWindow('7d', now);
    expect(w.days).toBe(7);
    expect(w.since.toISOString().slice(0, 10)).toBe('2026-08-05');
    expect(w.until.toISOString().slice(0, 10)).toBe('2026-08-12');
  });

  it('defaults to 7 days', () => {
    expect(parseWindow(undefined, now).days).toBe(7);
  });

  it('rejects nonsense rather than silently defaulting', () => {
    expect(() => parseWindow('soon', now)).toThrow(/7d/);
    expect(() => parseWindow('0d', now)).toThrow(/7d/);
  });
});

describe('summariseReasons', () => {
  it('says a shared cause once, rather than once per block', () => {
    const shared = 'Amplitude HTTP 403: Invalid API/Secret Key combination';
    expect(
      summariseReasons([
        ['activation', shared],
        ['monetization', shared],
        ['engagement', shared],
      ]),
    ).toBe(shared);
  });

  it('names each block when the causes differ', () => {
    const out = summariseReasons([
      ['reviews', 'HTTP 401'],
      ['sales', 'no vendor number'],
    ]);
    expect(out).toContain('reviews: HTTP 401');
    expect(out).toContain('sales: no vendor number');
  });
});

describe('the source registry', () => {
  it('registers every v1 source', () => {
    expect(SOURCES).toEqual(['crashes', 'reviews', 'amplitude', 'revenue', 'supabase']);
  });

  it('declares required credentials for every source', () => {
    for (const id of SOURCES) {
      expect(Array.isArray(REQUIRED_ENV[id])).toBe(true);
    }
  });
});
