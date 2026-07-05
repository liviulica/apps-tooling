/**
 * Namespace sync engine (CORE FILE — overwritten on blueprint re-sync).
 *
 * Pure logic, no React Native / Expo / Supabase imports, so it is unit-tested
 * inside apps-tooling. The app stays local-first: local storage remains the
 * source of truth and this engine mirrors it to the backend.
 *
 * Per namespace, syncAll() does: load local, pull remote, merged =
 * adapter.merge(local, remote), save merged locally, push merged when it
 * differs from remote. queuePush() debounces outgoing writes per namespace.
 */
import type {SyncRegistry, SyncResult, SyncTransport} from './types';

export interface SyncEngine {
  /** Full two-way pass over every registered namespace. */
  syncAll(userId: string): Promise<SyncResult>;
  /** Debounced push of one namespace's current local value. */
  queuePush(userId: string, namespace: string): void;
  /** Immediately runs all pending queued pushes. */
  flush(): Promise<void>;
  /** Cancels pending pushes and timers (e.g. on sign-out/unmount). */
  dispose(): void;
}

const DEFAULT_DEBOUNCE_MS = 4000;

function stableEquals(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function createSyncEngine(opts: {
  transport: SyncTransport;
  registry: SyncRegistry;
  debounceMs?: number;
}): SyncEngine {
  const {transport, registry} = opts;
  const debounceMs = opts.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const pending = new Map<string, string>(); // namespace -> userId
  let disposed = false;

  async function pushNamespace(userId: string, namespace: string): Promise<void> {
    const adapter = registry[namespace];
    if (!adapter) {
      return;
    }
    const local = await adapter.load();
    if (local == null) {
      return;
    }
    await transport.push(userId, namespace, local);
  }

  async function runPending(namespace: string): Promise<void> {
    const userId = pending.get(namespace);
    pending.delete(namespace);
    timers.delete(namespace);
    if (userId == null || disposed) {
      return;
    }
    await pushNamespace(userId, namespace);
  }

  return {
    async syncAll(userId) {
      const result: SyncResult = {pulled: [], pushed: [], errors: []};
      let remote: Awaited<ReturnType<SyncTransport['pullAll']>> = {};
      try {
        remote = await transport.pullAll(userId);
      } catch (e) {
        result.errors.push({
          namespace: '*',
          message: e instanceof Error ? e.message : String(e),
        });
        return result;
      }
      for (const [namespace, adapter] of Object.entries(registry)) {
        try {
          const local = await adapter.load();
          const remoteData = remote[namespace]?.data ?? null;
          const merged = adapter.merge(local, remoteData);
          if (merged == null) {
            continue;
          }
          if (!stableEquals(merged, local)) {
            await adapter.save(merged);
            result.pulled.push(namespace);
          }
          if (!stableEquals(merged, remoteData)) {
            await transport.push(userId, namespace, merged);
            result.pushed.push(namespace);
          }
        } catch (e) {
          result.errors.push({
            namespace,
            message: e instanceof Error ? e.message : String(e),
          });
        }
      }
      return result;
    },

    queuePush(userId, namespace) {
      if (disposed || !registry[namespace]) {
        return;
      }
      pending.set(namespace, userId);
      const existing = timers.get(namespace);
      if (existing) {
        clearTimeout(existing);
      }
      timers.set(
        namespace,
        setTimeout(() => {
          void runPending(namespace);
        }, debounceMs),
      );
    },

    async flush() {
      const namespaces = [...pending.keys()];
      for (const namespace of namespaces) {
        const timer = timers.get(namespace);
        if (timer) {
          clearTimeout(timer);
        }
        await runPending(namespace);
      }
    },

    dispose() {
      disposed = true;
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
      pending.clear();
    },
  };
}
