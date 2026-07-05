import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createSyncEngine} from '../template/lib/accounts/sync';
import type {
  NamespaceAdapter,
  RemoteState,
  SyncTransport,
} from '../template/lib/accounts/types';

type Store = Record<string, unknown>;

function makeAdapter(
  local: Store,
  key: string,
  merge: NamespaceAdapter<unknown>['merge'],
): NamespaceAdapter<unknown> {
  return {
    load: async () => (key in local ? local[key] : null),
    save: async data => {
      local[key] = data;
    },
    merge,
  };
}

/** Last-write-wins style merge helper used by most tests. */
const preferRemote: NamespaceAdapter<unknown>['merge'] = (localV, remoteV) =>
  remoteV ?? localV;

function makeTransport(remote: Record<string, RemoteState>) {
  const pushes: {namespace: string; data: unknown}[] = [];
  const transport: SyncTransport = {
    pullAll: async () => remote,
    push: async (_userId, namespace, data) => {
      pushes.push({namespace, data});
      remote[namespace] = {data, updatedAt: '2026-07-05T00:00:00Z'};
    },
  };
  return {transport, pushes};
}

describe('createSyncEngine', () => {
  it('merges remote into local and saves the merged value', async () => {
    const local: Store = {settings: {fontSize: 16}};
    const {transport} = makeTransport({
      settings: {data: {fontSize: 22}, updatedAt: '2026-07-01T00:00:00Z'},
    });
    const engine = createSyncEngine({
      transport,
      registry: {settings: makeAdapter(local, 'settings', preferRemote)},
    });

    const result = await engine.syncAll('user-1');

    expect(local.settings).toEqual({fontSize: 22});
    expect(result.pulled).toEqual(['settings']);
    expect(result.errors).toEqual([]);
  });

  it('pushes local data when the namespace is missing remotely', async () => {
    const local: Store = {wishlist: ['moby-dick']};
    const {transport, pushes} = makeTransport({});
    const engine = createSyncEngine({
      transport,
      registry: {wishlist: makeAdapter(local, 'wishlist', preferRemote)},
    });

    const result = await engine.syncAll('user-1');

    expect(pushes).toEqual([{namespace: 'wishlist', data: ['moby-dick']}]);
    expect(result.pushed).toEqual(['wishlist']);
  });

  it('does not push when merged equals remote', async () => {
    const local: Store = {theme: 'paper'};
    const {transport, pushes} = makeTransport({
      theme: {data: 'paper', updatedAt: '2026-07-01T00:00:00Z'},
    });
    const engine = createSyncEngine({
      transport,
      registry: {theme: makeAdapter(local, 'theme', preferRemote)},
    });

    await engine.syncAll('user-1');

    expect(pushes).toEqual([]);
  });

  it('skips namespaces where merge yields null (nothing anywhere)', async () => {
    const local: Store = {};
    const {transport, pushes} = makeTransport({});
    const engine = createSyncEngine({
      transport,
      registry: {stats: makeAdapter(local, 'stats', preferRemote)},
    });

    const result = await engine.syncAll('user-1');

    expect(pushes).toEqual([]);
    expect(result.pulled).toEqual([]);
    expect(result.pushed).toEqual([]);
    expect('stats' in local).toBe(false);
  });

  it('one failing namespace does not block the others', async () => {
    const local: Store = {b: 2};
    const {transport, pushes} = makeTransport({});
    const failing: NamespaceAdapter<unknown> = {
      load: async () => {
        throw new Error('disk on fire');
      },
      save: async () => {},
      merge: preferRemote,
    };
    const engine = createSyncEngine({
      transport,
      registry: {a: failing, b: makeAdapter(local, 'b', preferRemote)},
    });

    const result = await engine.syncAll('user-1');

    expect(result.errors).toEqual([{namespace: 'a', message: 'disk on fire'}]);
    expect(pushes).toEqual([{namespace: 'b', data: 2}]);
  });

  describe('queuePush debouncing', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('coalesces rapid queuePush calls into one push after the debounce', async () => {
      const local: Store = {progress: {page: 1}};
      const {transport, pushes} = makeTransport({});
      const engine = createSyncEngine({
        transport,
        registry: {progress: makeAdapter(local, 'progress', preferRemote)},
        debounceMs: 1000,
      });

      engine.queuePush('user-1', 'progress');
      local.progress = {page: 2};
      engine.queuePush('user-1', 'progress');
      local.progress = {page: 3};
      engine.queuePush('user-1', 'progress');

      await vi.advanceTimersByTimeAsync(999);
      expect(pushes).toEqual([]);
      await vi.advanceTimersByTimeAsync(1);
      expect(pushes).toEqual([{namespace: 'progress', data: {page: 3}}]);
    });

    it('flush() sends pending pushes immediately', async () => {
      const local: Store = {progress: {page: 7}};
      const {transport, pushes} = makeTransport({});
      const engine = createSyncEngine({
        transport,
        registry: {progress: makeAdapter(local, 'progress', preferRemote)},
        debounceMs: 60_000,
      });

      engine.queuePush('user-1', 'progress');
      await engine.flush();

      expect(pushes).toEqual([{namespace: 'progress', data: {page: 7}}]);
      await vi.advanceTimersByTimeAsync(120_000);
      expect(pushes).toHaveLength(1);
    });

    it('dispose() cancels pending pushes', async () => {
      const local: Store = {progress: {page: 9}};
      const {transport, pushes} = makeTransport({});
      const engine = createSyncEngine({
        transport,
        registry: {progress: makeAdapter(local, 'progress', preferRemote)},
        debounceMs: 1000,
      });

      engine.queuePush('user-1', 'progress');
      engine.dispose();
      await vi.advanceTimersByTimeAsync(5000);

      expect(pushes).toEqual([]);
    });

    it('ignores queuePush for unregistered namespaces', async () => {
      const {transport, pushes} = makeTransport({});
      const engine = createSyncEngine({transport, registry: {}, debounceMs: 10});

      engine.queuePush('user-1', 'nope');
      await vi.advanceTimersByTimeAsync(50);

      expect(pushes).toEqual([]);
    });
  });
});
