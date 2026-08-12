/**
 * Supabase is the only place sync failures and in-app feedback are visible.
 * The feedback table matters most: it is the review ask's UNHAPPY path, so
 * everything in it is a complaint that never reached the App Store.
 */
import {fetchSupabase, serviceKeyFrom} from '../scripts/monitoring/sources/supabase';

const WINDOW = {
  days: 7,
  since: new Date('2026-08-05T00:00:00Z'),
  until: new Date('2026-08-12T00:00:00Z'),
};

const KEYS_JSON = JSON.stringify([
  {id: 'anon', name: 'anon', api_key: 'anon-key'},
  {id: 'service_role', name: 'service_role', api_key: 'service-key'},
]);

function fakeExec(result: string | Error) {
  return () => {
    if (result instanceof Error) {
      throw result;
    }
    return result;
  };
}

function fakeFetch(responder: (url: string) => {status?: number; body?: unknown; count?: number}) {
  const calls: Array<{url: string; headers: Record<string, string>}> = [];
  const impl = async (url: string, init: {headers?: Record<string, string>} = {}) => {
    calls.push({url, headers: init.headers || {}});
    const {status = 200, body = [], count = 0} = responder(url);
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: {get: (name: string) => (name.toLowerCase() === 'content-range' ? `0-0/${count}` : null)},
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  };
  return {impl, calls};
}

describe('serviceKeyFrom', () => {
  it('picks the service_role key out of the CLI listing', () => {
    expect(serviceKeyFrom(KEYS_JSON)).toBe('service-key');
  });

  it('throws rather than falling back to the anon key, which cannot read these tables', () => {
    expect(() => serviceKeyFrom(JSON.stringify([{id: 'anon', api_key: 'anon-key'}]))).toThrow(
      /service_role/,
    );
  });
});

describe('fetchSupabase credentials', () => {
  it('is unavailable and names the login command when the CLI cannot answer', async () => {
    const {impl} = fakeFetch(() => ({count: 0}));
    const result = await fetchSupabase({
      window: WINDOW,
      execImpl: fakeExec(new Error('command not found: supabase')),
      fetchImpl: impl,
    });
    expect(result.status).toBe('unavailable');
    expect(result.reason).toMatch(/supabase login/);
    expect(result.data).toBeUndefined();
  });

  it('never puts the service key in the returned data', async () => {
    const {impl} = fakeFetch(() => ({count: 3, body: []}));
    const result = await fetchSupabase({
      window: WINDOW,
      execImpl: fakeExec(KEYS_JSON),
      fetchImpl: impl,
    });
    expect(JSON.stringify(result)).not.toContain('service-key');
  });

  it('authenticates every request with the service key', async () => {
    const {impl, calls} = fakeFetch(() => ({count: 0, body: []}));
    await fetchSupabase({window: WINDOW, execImpl: fakeExec(KEYS_JSON), fetchImpl: impl});
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call.headers.apikey).toBe('service-key');
      expect(call.headers.Authorization).toBe('Bearer service-key');
    }
  });
});

describe('fetchSupabase blocks', () => {
  it('counts accounts and signups from the content-range header', async () => {
    const {impl} = fakeFetch(url => {
      if (url.includes('profiles') && url.includes('created_at')) {
        return {count: 4, body: []};
      }
      if (url.includes('profiles')) {
        return {count: 31, body: []};
      }
      return {count: 0, body: []};
    });
    const result = await fetchSupabase({window: WINDOW, execImpl: fakeExec(KEYS_JSON), fetchImpl: impl});
    expect(result.data.accounts.status).toBe('ok');
    expect(result.data.accounts.data).toMatchObject({total: 31, newInWindow: 4});
  });

  it('reports feedback with its text, because the snapshot is where complaints are readable', async () => {
    const {impl} = fakeFetch(url =>
      url.includes('app_feedback')
        ? {
            count: 2,
            body: [
              {created_at: '2026-08-10T10:00:00Z', message: 'the reader skips pages', app_version: '1.5.0', platform: 'ios'},
              {created_at: '2026-08-11T10:00:00Z', message: 'love it', app_version: '1.5.0', platform: 'android'},
            ],
          }
        : {count: 0, body: []},
    );
    const result = await fetchSupabase({window: WINDOW, execImpl: fakeExec(KEYS_JSON), fetchImpl: impl});
    expect(result.data.feedback.status).toBe('ok');
    expect(result.data.feedback.data.notes).toHaveLength(2);
    expect(result.data.feedback.data.byPlatform).toEqual({ios: 1, android: 1});
  });

  it('reads no feedback as missing, which is a real answer', async () => {
    const {impl} = fakeFetch(() => ({count: 0, body: []}));
    const result = await fetchSupabase({window: WINDOW, execImpl: fakeExec(KEYS_JSON), fetchImpl: impl});
    expect(result.data.feedback.status).toBe('missing');
  });

  it('reads a 500 on one table as that block being unavailable, not empty', async () => {
    const {impl} = fakeFetch(url =>
      url.includes('user_state') ? {status: 500, body: {}} : {count: 1, body: []},
    );
    const result = await fetchSupabase({window: WINDOW, execImpl: fakeExec(KEYS_JSON), fetchImpl: impl});
    expect(result.data.sync.status).toBe('unavailable');
    expect(result.data.sync.reason).toContain('500');
    expect(result.data.accounts.status).toBe('ok');
  });

  it('explains that edge function logs need a management token rather than reporting zero errors', async () => {
    const {impl} = fakeFetch(() => ({count: 0, body: []}));
    const result = await fetchSupabase({window: WINDOW, execImpl: fakeExec(KEYS_JSON), fetchImpl: impl});
    expect(result.data.functionErrors.status).toBe('unavailable');
    expect(result.data.functionErrors.reason).toContain('SUPABASE_ACCESS_TOKEN');
  });
});
