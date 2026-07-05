# Accounts Module (Supabase) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `modules/accounts` in apps-tooling: a vendored Supabase blueprint giving any Expo app native Apple/Google/email-OTP sign-in, namespace-based settings/progress sync, book/item sharing tables, App-Store-compliant account deletion, and a RevenueCat webhook stub.

**Architecture:** Mirrors the analytics module anatomy exactly (`template/` + `blueprint.json` + `SKILL.md` + `README.md`, core/app file ownership). Client code is a thin wrapper where `client.ts` is the only file importing `@supabase/supabase-js`; the sync engine is pure dependency-free TypeScript (unit-tested in this repo); server code is Supabase migrations + Deno edge functions vendored under `supabase/`. Design rationale and verified research: `daily-book/docs/accounts-research.md`.

**Tech Stack:** TypeScript (strict), Supabase (`@supabase/supabase-js` v2, edge functions on Deno, Postgres + RLS), `expo-apple-authentication`, `@react-native-google-signin/google-signin`, vitest for the pure-logic tests.

## Global Constraints

- Repo style: match the analytics module exactly. Prettier style: single quotes, semicolons, 2-space indent, NO spaces inside braces (`{children}`, `{ANALYTICS_API_KEY}`), trailing commas.
- Core file header convention, verbatim marker: `(CORE FILE — overwritten on blueprint re-sync)`. App-owned files: `(APP-OWNED FILE — NOT overwritten on blueprint re-sync)`.
- `client.ts` is the ONLY file importing `@supabase/supabase-js`. `sync.ts` and `types.ts` import nothing from React Native, Expo, or Supabase (they must run under vitest in this repo).
- Every client function is safe when the module is unconfigured (missing env): no-op or error-result, `__DEV__` console.warn, never throw at import time. Same pattern as analytics `client.ts`.
- `EXPO_PUBLIC_` prefix ONLY for client-safe values (Supabase URL, anon key, Google web client id). Server secrets (Apple .p8 etc.) exist only as Supabase function secrets, never in the app bundle, never in blueprint `env` entries with `"scope": "client"`.
- New markdown prose avoids em dashes (user's global rule); the established header marker above is the one exception (existing convention).
- Branch: `feat/accounts-module` off `main` (NOT off `fix/analytics-server-zone`).
- Commit after every task with a conventional-commits message.

## File Map

Created in apps-tooling:

```
package.json                                  # dev harness (task 1)
tsconfig.json                                 # typecheck scope: pure files + tests (task 1)
modules/accounts/
  blueprint.json                              # task 8
  SKILL.md                                    # task 9
  README.md                                   # task 9
  tests/sync.test.ts                          # task 2 (NOT vendored; lives outside template/)
  template/
    lib/accounts/
      types.ts                                # task 2 (core)
      sync.ts                                 # task 2 (core)
      config.ts                               # task 3 (core)
      client.ts                               # task 3 (core)
      signin-apple.ts                         # task 4 (core)
      signin-google.ts                        # task 4 (core)
      signin-email.ts                         # task 4 (core)
      provider.tsx                            # task 5 (core)
      sync-registry.ts                        # task 5 (app)
      index.ts                                # task 5 (core)
    components/accounts/SignInSection.tsx     # task 5 (app, example UI)
    supabase/
      migrations/0001_accounts_core.sql       # task 6 (core)
      migrations/0002_shares.sql              # task 6 (core)
      functions/_shared/apple.ts              # task 7 (core)
      functions/apple-token-exchange/index.ts # task 7 (core)
      functions/delete-account/index.ts       # task 7 (core)
      functions/revenuecat-webhook/index.ts   # task 7 (core)
    accounts-authoring-rule.md                # task 8
Modified: README.md (root, module table row, task 9), .gitignore (task 1)
```

---

### Task 1: Branch + dev harness

The tooling repo has no package.json today. Add a minimal harness so the pure sync logic is testable here (the RN-dependent files are typechecked later in the consumer app, same as analytics).

**Files:**
- Create: `package.json`, `tsconfig.json`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `npm test` (vitest run) and `npm run typecheck` commands used by every later task.

- [ ] **Step 1: Branch off main**

```bash
cd /Users/liviu/Coding/personal-projescts/apps-tooling
git checkout main && git pull && git checkout -b feat/accounts-module
```

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "apps-tooling",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json"
  },
  "devDependencies": {
    "typescript": "~5.9.2",
    "vitest": "^3.2.4"
  }
}
```

- [ ] **Step 3: Write `tsconfig.json`**

Scope: only the dependency-free files. RN/Expo/Supabase-importing template files are EXCLUDED on purpose (their deps are not installed here; consumer-app `tsc --noEmit` covers them, per the analytics verify convention).

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": [
    "modules/accounts/template/lib/accounts/types.ts",
    "modules/accounts/template/lib/accounts/sync.ts",
    "modules/accounts/tests/**/*.ts"
  ]
}
```

- [ ] **Step 4: Gitignore node_modules**

Append to `.gitignore` (check current content first; add only missing lines):

```
node_modules/
```

- [ ] **Step 5: Install and verify the harness runs**

```bash
npm install
npm run typecheck   # expected: exits 0 (no input files is fine at this point: add "files": [] behavior check; if tsc errors with 'No inputs were found', that is EXPECTED until task 2 creates the files; note it and move on)
```

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json .gitignore package-lock.json
git commit -m "chore: dev harness (vitest + tsc) for module logic tests"
```

---

### Task 2: `types.ts` + `sync.ts` (TDD, the risk core)

**Files:**
- Create: `modules/accounts/template/lib/accounts/types.ts`
- Create: `modules/accounts/template/lib/accounts/sync.ts`
- Test: `modules/accounts/tests/sync.test.ts`

**Interfaces:**
- Produces (used by tasks 3, 5): everything in `types.ts` below, and `createSyncEngine(opts: {transport: SyncTransport; registry: SyncRegistry; debounceMs?: number}): SyncEngine`.

- [ ] **Step 1: Write `types.ts`** (no test needed, types only)

```ts
/**
 * Shared accounts/sync types (CORE FILE — overwritten on blueprint re-sync).
 *
 * Pure types, no imports. Safe for both app code and the vitest harness in
 * apps-tooling.
 */
export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

export type AuthMethod = 'apple' | 'google' | 'email';

export interface AccountsUser {
  id: string;
  email: string | null;
  method: AuthMethod | null;
  displayName: string | null;
}

export type SignInResult =
  | {status: 'success'; userId: string}
  | {status: 'cancelled'}
  | {status: 'error'; message: string};

/**
 * One synced namespace (e.g. 'settings', 'progress'). The app implements
 * load/save against its own local store and a merge that reconciles a local
 * and a remote copy. merge() must be pure and total: it is called with null
 * for whichever side is missing.
 */
export interface NamespaceAdapter<T> {
  load(): Promise<T | null>;
  save(data: T): Promise<void>;
  merge(local: T | null, remote: T | null): T | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SyncRegistry = Record<string, NamespaceAdapter<any>>;

export interface RemoteState {
  data: unknown;
  updatedAt: string;
}

export interface SyncTransport {
  pullAll(userId: string): Promise<Record<string, RemoteState>>;
  push(userId: string, namespace: string, data: unknown): Promise<void>;
}

export interface SyncResult {
  pulled: string[];
  pushed: string[];
  errors: {namespace: string; message: string}[];
}
```

- [ ] **Step 2: Write the failing tests**

`modules/accounts/tests/sync.test.ts`:

```ts
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
```

- [ ] **Step 3: Run tests, verify they fail**

```bash
npm test
```
Expected: FAIL, `Cannot find module '../template/lib/accounts/sync'` (or similar).

- [ ] **Step 4: Implement `sync.ts`**

```ts
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
```

Note for the merges-remote test: when merged equals local, nothing is saved and `pulled` stays empty; when merged differs from local it is saved and counted as pulled. The first test expects `pulled: ['settings']` because remote 22 replaces local 16.

- [ ] **Step 5: Run tests + typecheck, verify green**

```bash
npm test && npm run typecheck
```
Expected: all 9 tests PASS, tsc exits 0.

- [ ] **Step 6: Commit**

```bash
git add modules/accounts/template/lib/accounts/types.ts modules/accounts/template/lib/accounts/sync.ts modules/accounts/tests/sync.test.ts
git commit -m "feat(accounts): pure sync engine + shared types with vitest coverage"
```

---

### Task 3: `config.ts` + `client.ts`

**Files:**
- Create: `modules/accounts/template/lib/accounts/config.ts`
- Create: `modules/accounts/template/lib/accounts/client.ts`

**Interfaces:**
- Consumes: `SyncTransport`, `RemoteState` from types.ts.
- Produces (used by tasks 4, 5): `isConfigured: boolean`, `GOOGLE_WEB_CLIENT_ID: string`, `getSupabase(): SupabaseClient | null`, `makeTransport(): SyncTransport | null`, `invokeFunction<T>(name: string, body?: Record<string, unknown>): Promise<T>`.

These import RN/Supabase, so no harness tests; correctness is covered by consumer-app `tsc --noEmit` (blueprint verify step) and code review.

- [ ] **Step 1: Write `config.ts`**

```ts
/**
 * Shared accounts config (CORE FILE — overwritten on blueprint re-sync).
 *
 * All values come from Expo public env vars so they differ per app without
 * code changes. All three are client-safe public values; row level security
 * is the actual security boundary. Server secrets (Apple .p8 key etc.) live
 * ONLY as Supabase function secrets, never in the app bundle.
 *
 *   EXPO_PUBLIC_SUPABASE_URL           — https://<project-ref>.supabase.co
 *   EXPO_PUBLIC_SUPABASE_ANON_KEY      — the project's anon/public API key
 *   EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID   — Google OAuth WEB client id (yes, the
 *     web one: the native library exchanges it for tokens Supabase accepts)
 */
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const GOOGLE_WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';

export const isConfigured = SUPABASE_URL !== '' && SUPABASE_ANON_KEY !== '';
```

- [ ] **Step 2: Write `client.ts`**

```ts
/**
 * Supabase client wrapper (CORE FILE — overwritten on blueprint re-sync).
 *
 * This is the ONLY file that imports @supabase/supabase-js. App code never
 * touches Supabase directly: it goes through the provider/hooks or the sync
 * engine. To swap backends, this is the single file you rewrite.
 *
 * Everything is safe when the module is unconfigured (missing env): getters
 * return null and callers degrade to signed-out, so accounts never break the
 * app.
 */
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {createClient, type SupabaseClient} from '@supabase/supabase-js';
import {SUPABASE_ANON_KEY, SUPABASE_URL, isConfigured} from './config';
import type {RemoteState, SyncTransport} from './types';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!isConfigured) {
    if (__DEV__) {
      console.warn(
        '[accounts] EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY not set — accounts are disabled.',
      );
    }
    return null;
  }
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}

/** SyncTransport backed by the user_state table (RLS scopes rows to the user). */
export function makeTransport(): SyncTransport | null {
  const supabase = getSupabase();
  if (!supabase) {
    return null;
  }
  return {
    async pullAll(userId) {
      const {data, error} = await supabase
        .from('user_state')
        .select('namespace, data, updated_at')
        .eq('user_id', userId);
      if (error) {
        throw new Error(error.message);
      }
      const result: Record<string, RemoteState> = {};
      for (const row of data ?? []) {
        result[row.namespace as string] = {
          data: row.data,
          updatedAt: row.updated_at as string,
        };
      }
      return result;
    },
    async push(userId, namespace, data) {
      const {error} = await supabase.from('user_state').upsert({
        user_id: userId,
        namespace,
        data,
        updated_at: new Date().toISOString(),
      });
      if (error) {
        throw new Error(error.message);
      }
    },
  };
}

/** Calls a Supabase edge function with the signed-in user's JWT attached. */
export async function invokeFunction<T>(
  name: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('[accounts] not configured');
  }
  const {data, error} = await supabase.functions.invoke(name, {body});
  if (error) {
    throw new Error(error.message);
  }
  return data as T;
}
```

- [ ] **Step 3: Commit**

```bash
git add modules/accounts/template/lib/accounts/config.ts modules/accounts/template/lib/accounts/client.ts
git commit -m "feat(accounts): env config + supabase client wrapper (single SDK boundary)"
```

---

### Task 4: Sign-in methods (Apple, Google, email OTP)

**Files:**
- Create: `modules/accounts/template/lib/accounts/signin-apple.ts`
- Create: `modules/accounts/template/lib/accounts/signin-google.ts`
- Create: `modules/accounts/template/lib/accounts/signin-email.ts`

**Interfaces:**
- Consumes: `getSupabase`, `invokeFunction` (task 3), `GOOGLE_WEB_CLIENT_ID` (task 3), `SignInResult` (task 2).
- Produces (used by task 5): `signInWithApple(): Promise<SignInResult>`, `signInWithGoogle(): Promise<SignInResult>`, `requestEmailOtp(email: string): Promise<{sent: boolean; message?: string}>`, `verifyEmailOtp(email: string, code: string): Promise<SignInResult>`.

- [ ] **Step 1: Write `signin-apple.ts`**

```ts
/**
 * Native Sign in with Apple (CORE FILE — overwritten on blueprint re-sync).
 *
 * iOS only (expo-apple-authentication has no Android implementation; hide the
 * button on Android). Flow per Supabase's documented native path: the Apple
 * identity token goes to supabase.auth.signInWithIdToken.
 *
 * The authorizationCode is forwarded (best effort) to the apple-token-exchange
 * edge function, which stores a refresh token server-side. That token is what
 * lets delete-account revoke Apple credentials, an App Store requirement
 * (guideline 5.1.1(v) + TN3194).
 */
import * as AppleAuthentication from 'expo-apple-authentication';
import {getSupabase, invokeFunction} from './client';
import type {SignInResult} from './types';

export async function signInWithApple(): Promise<SignInResult> {
  const supabase = getSupabase();
  if (!supabase) {
    return {status: 'error', message: 'Accounts are not configured.'};
  }
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
  } catch (e) {
    if ((e as {code?: string}).code === 'ERR_REQUEST_CANCELED') {
      return {status: 'cancelled'};
    }
    return {status: 'error', message: e instanceof Error ? e.message : String(e)};
  }
  if (!credential.identityToken) {
    return {status: 'error', message: 'Apple returned no identity token.'};
  }
  const {data, error} = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });
  if (error || !data.user) {
    return {status: 'error', message: error?.message ?? 'Sign-in failed.'};
  }

  // Apple only provides the name on the FIRST authorization; persist it now.
  const givenName = credential.fullName?.givenName;
  if (givenName) {
    void supabase
      .from('profiles')
      .update({display_name: givenName})
      .eq('id', data.user.id)
      .then(() => {});
  }

  // Store the refresh token server-side for deletion-time revocation.
  if (credential.authorizationCode) {
    invokeFunction('apple-token-exchange', {
      authorization_code: credential.authorizationCode,
    }).catch(e => {
      if (__DEV__) {
        console.warn('[accounts] apple-token-exchange failed:', e);
      }
    });
  }

  return {status: 'success', userId: data.user.id};
}
```

- [ ] **Step 2: Write `signin-google.ts`**

```ts
/**
 * Native Google sign-in (CORE FILE — overwritten on blueprint re-sync).
 *
 * Uses the free @react-native-google-signin/google-signin library per
 * Supabase's documented React Native path. Requires the Google WEB client id
 * (not the iOS/Android ones) in EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID, and the
 * Supabase dashboard setting Authentication > Providers > Google >
 * "Skip Nonce Check" enabled (the free library cannot pass a custom nonce).
 */
import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import {GOOGLE_WEB_CLIENT_ID} from './config';
import {getSupabase} from './client';
import type {SignInResult} from './types';

let configured = false;

export async function signInWithGoogle(): Promise<SignInResult> {
  const supabase = getSupabase();
  if (!supabase) {
    return {status: 'error', message: 'Accounts are not configured.'};
  }
  if (!GOOGLE_WEB_CLIENT_ID) {
    if (__DEV__) {
      console.warn(
        '[accounts] EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is not set — Google sign-in is disabled.',
      );
    }
    return {status: 'error', message: 'Google sign-in is not configured.'};
  }
  if (!configured) {
    GoogleSignin.configure({webClientId: GOOGLE_WEB_CLIENT_ID});
    configured = true;
  }
  try {
    await GoogleSignin.hasPlayServices();
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response) || !response.data.idToken) {
      return {status: 'cancelled'};
    }
    const {data, error} = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: response.data.idToken,
    });
    if (error || !data.user) {
      return {status: 'error', message: error?.message ?? 'Sign-in failed.'};
    }
    return {status: 'success', userId: data.user.id};
  } catch (e) {
    if (isErrorWithCode(e) && e.code === statusCodes.SIGN_IN_CANCELLED) {
      return {status: 'cancelled'};
    }
    return {status: 'error', message: e instanceof Error ? e.message : String(e)};
  }
}
```

- [ ] **Step 3: Write `signin-email.ts`**

```ts
/**
 * Email OTP sign-in (CORE FILE — overwritten on blueprint re-sync).
 *
 * Passwordless 6-digit code flow: no passwords to reset, no deep links to
 * register (the user types the code into the app). Requires the Email
 * provider enabled in Supabase with the OTP template (the default
 * "Magic Link" email template must include {{ .Token }}).
 */
import {getSupabase} from './client';
import type {SignInResult} from './types';

export async function requestEmailOtp(
  email: string,
): Promise<{sent: boolean; message?: string}> {
  const supabase = getSupabase();
  if (!supabase) {
    return {sent: false, message: 'Accounts are not configured.'};
  }
  const {error} = await supabase.auth.signInWithOtp({
    email,
    options: {shouldCreateUser: true},
  });
  if (error) {
    return {sent: false, message: error.message};
  }
  return {sent: true};
}

export async function verifyEmailOtp(
  email: string,
  code: string,
): Promise<SignInResult> {
  const supabase = getSupabase();
  if (!supabase) {
    return {status: 'error', message: 'Accounts are not configured.'};
  }
  const {data, error} = await supabase.auth.verifyOtp({
    email,
    token: code,
    type: 'email',
  });
  if (error || !data.user) {
    return {status: 'error', message: error?.message ?? 'Invalid code.'};
  }
  return {status: 'success', userId: data.user.id};
}
```

- [ ] **Step 4: Commit**

```bash
git add modules/accounts/template/lib/accounts/signin-apple.ts modules/accounts/template/lib/accounts/signin-google.ts modules/accounts/template/lib/accounts/signin-email.ts
git commit -m "feat(accounts): native Apple/Google + email OTP sign-in flows"
```

---

### Task 5: Provider, registry stub, barrel, example UI

**Files:**
- Create: `modules/accounts/template/lib/accounts/provider.tsx`
- Create: `modules/accounts/template/lib/accounts/sync-registry.ts`
- Create: `modules/accounts/template/lib/accounts/index.ts`
- Create: `modules/accounts/template/components/accounts/SignInSection.tsx`

**Interfaces:**
- Consumes: everything from tasks 2-4.
- Produces: `<AccountsProvider onAuthEvent?>`, `useAccounts(): AccountsApi` where `AccountsApi = {status, user, signInWithApple, signInWithGoogle, requestEmailOtp, verifyEmailOtp, signOut, deleteAccount, syncNow, queuePush}`.

- [ ] **Step 1: Write `sync-registry.ts`** (app-owned)

```ts
/**
 * Sync registry (APP-OWNED FILE — NOT overwritten on blueprint re-sync).
 *
 * The ONLY accounts file you edit per app. Declare each piece of local state
 * that should follow the user across devices: how to load/save it locally and
 * how to merge a local and a remote copy.
 *
 * Merge rules of thumb:
 *   - counters / totals: take the max
 *   - "furthest progress": take the max per item
 *   - preferences: last-write-wins (prefer whichever side you trust; add a
 *     timestamp inside the payload if you need real LWW)
 *   - collections (wishlist): union by id
 * merge() is called with null for a missing side and must be pure.
 *
 * Example (AsyncStorage-backed namespace):
 *
 *   import AsyncStorage from '@react-native-async-storage/async-storage';
 *
 *   const settings: NamespaceAdapter<{fontSize: number}> = {
 *     load: async () => {
 *       const raw = await AsyncStorage.getItem('@myapp_settings');
 *       return raw ? JSON.parse(raw) : null;
 *     },
 *     save: async data => {
 *       await AsyncStorage.setItem('@myapp_settings', JSON.stringify(data));
 *     },
 *     merge: (local, remote) => remote ?? local,
 *   };
 *
 *   export const syncRegistry: SyncRegistry = {settings};
 */
import type {SyncRegistry} from './types';

export const syncRegistry: SyncRegistry = {
  // --- register your app's synced namespaces here ---
};
```

- [ ] **Step 2: Write `provider.tsx`**

```tsx
/**
 * Accounts provider + hook (CORE FILE — overwritten on blueprint re-sync).
 *
 * Mount <AccountsProvider> once, INSIDE <AnalyticsProvider> (so onAuthEvent
 * can identify the user) and ABOVE the app's data providers (so they can
 * react to the session). The app keeps working signed-out; every method
 * degrades safely when env is missing.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {AppState} from 'react-native';
import type {Session} from '@supabase/supabase-js';
import {getSupabase, invokeFunction, makeTransport} from './client';
import {signInWithApple} from './signin-apple';
import {signInWithGoogle} from './signin-google';
import {requestEmailOtp, verifyEmailOtp} from './signin-email';
import {createSyncEngine, type SyncEngine} from './sync';
import {syncRegistry} from './sync-registry';
import type {
  AccountsUser,
  AuthMethod,
  AuthStatus,
  SignInResult,
  SyncResult,
} from './types';

export type AuthEvent = 'signed_in' | 'signed_out' | 'account_deleted';

type AccountsApi = {
  status: AuthStatus;
  user: AccountsUser | null;
  signInWithApple: () => Promise<SignInResult>;
  signInWithGoogle: () => Promise<SignInResult>;
  requestEmailOtp: (email: string) => Promise<{sent: boolean; message?: string}>;
  verifyEmailOtp: (email: string, code: string) => Promise<SignInResult>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<{deleted: boolean; message?: string}>;
  /** Manual full sync; returns null when signed out/unconfigured. */
  syncNow: () => Promise<SyncResult | null>;
  /** Debounced push of one registered namespace (call after local writes). */
  queuePush: (namespace: string) => void;
};

const AccountsContext = createContext<AccountsApi | null>(null);

function toUser(session: Session | null): AccountsUser | null {
  if (!session?.user) {
    return null;
  }
  const provider = (session.user.app_metadata?.provider ?? null) as string | null;
  const method: AuthMethod | null =
    provider === 'apple' || provider === 'google' || provider === 'email'
      ? provider
      : null;
  return {
    id: session.user.id,
    email: session.user.email ?? null,
    method,
    displayName:
      (session.user.user_metadata?.display_name as string | undefined) ?? null,
  };
}

export function AccountsProvider({
  children,
  onAuthEvent,
}: {
  children: React.ReactNode;
  onAuthEvent?: (event: AuthEvent, user: AccountsUser | null) => void;
}) {
  const supabase = useMemo(() => getSupabase(), []);
  const [status, setStatus] = useState<AuthStatus>(
    supabase ? 'loading' : 'signedOut',
  );
  const [user, setUser] = useState<AccountsUser | null>(null);
  const engineRef = useRef<SyncEngine | null>(null);
  const userRef = useRef<AccountsUser | null>(null);
  userRef.current = user;

  useEffect(() => {
    if (!supabase) {
      return;
    }
    const transport = makeTransport();
    if (transport) {
      engineRef.current = createSyncEngine({transport, registry: syncRegistry});
    }

    void supabase.auth.getSession().then(({data}) => {
      const nextUser = toUser(data.session);
      setUser(nextUser);
      setStatus(nextUser ? 'signedIn' : 'signedOut');
      if (nextUser) {
        void engineRef.current?.syncAll(nextUser.id);
      }
    });

    const {data: sub} = supabase.auth.onAuthStateChange((event, session) => {
      const nextUser = toUser(session);
      setUser(nextUser);
      setStatus(nextUser ? 'signedIn' : 'signedOut');
      if (event === 'SIGNED_IN' && nextUser) {
        onAuthEvent?.('signed_in', nextUser);
        void engineRef.current?.syncAll(nextUser.id);
      } else if (event === 'SIGNED_OUT') {
        onAuthEvent?.('signed_out', null);
      }
    });

    const appStateSub = AppState.addEventListener('change', next => {
      const current = userRef.current;
      if (next === 'active' && current) {
        void engineRef.current?.syncAll(current.id);
      } else if (next !== 'active') {
        void engineRef.current?.flush();
      }
    });

    return () => {
      sub.subscription.unsubscribe();
      appStateSub.remove();
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, [supabase, onAuthEvent]);

  const signOut = useCallback(async () => {
    if (!supabase) {
      return;
    }
    await engineRef.current?.flush();
    await supabase.auth.signOut();
  }, [supabase]);

  const deleteAccount = useCallback(async (): Promise<{
    deleted: boolean;
    message?: string;
  }> => {
    if (!supabase) {
      return {deleted: false, message: 'Accounts are not configured.'};
    }
    try {
      await invokeFunction('delete-account');
    } catch (e) {
      return {
        deleted: false,
        message: e instanceof Error ? e.message : String(e),
      };
    }
    onAuthEvent?.('account_deleted', userRef.current);
    await supabase.auth.signOut();
    return {deleted: true};
  }, [supabase, onAuthEvent]);

  const syncNow = useCallback(async () => {
    const current = userRef.current;
    if (!current || !engineRef.current) {
      return null;
    }
    return engineRef.current.syncAll(current.id);
  }, []);

  const queuePush = useCallback((namespace: string) => {
    const current = userRef.current;
    if (!current) {
      return;
    }
    engineRef.current?.queuePush(current.id, namespace);
  }, []);

  const api = useMemo<AccountsApi>(
    () => ({
      status,
      user,
      signInWithApple,
      signInWithGoogle,
      requestEmailOtp,
      verifyEmailOtp,
      signOut,
      deleteAccount,
      syncNow,
      queuePush,
    }),
    [status, user, signOut, deleteAccount, syncNow, queuePush],
  );

  return (
    <AccountsContext.Provider value={api}>{children}</AccountsContext.Provider>
  );
}

export function useAccounts(): AccountsApi {
  const ctx = useContext(AccountsContext);
  if (!ctx) {
    throw new Error('useAccounts must be used within <AccountsProvider>');
  }
  return ctx;
}
```

- [ ] **Step 3: Write `index.ts`**

```ts
/**
 * Accounts public API (CORE FILE — overwritten on blueprint re-sync).
 *
 * Import everything from here:
 *   import {AccountsProvider, useAccounts} from './lib/accounts';
 */
export {AccountsProvider, useAccounts, type AuthEvent} from './provider';
export {syncRegistry} from './sync-registry';
export type {
  AccountsUser,
  AuthMethod,
  AuthStatus,
  NamespaceAdapter,
  SignInResult,
  SyncRegistry,
  SyncResult,
} from './types';
```

- [ ] **Step 4: Write `components/accounts/SignInSection.tsx`** (app-owned example)

```tsx
/**
 * Example sign-in UI (APP-OWNED FILE — NOT overwritten on blueprint re-sync).
 *
 * A deliberately unstyled starting point: restyle it with your app's design
 * system, or discard it and build your own on top of useAccounts(). Hide the
 * Apple button on Android (expo-apple-authentication is iOS-only).
 */
import React, {useState} from 'react';
import {Button, Platform, Text, TextInput, View} from 'react-native';
import {useAccounts} from '../../lib/accounts';

export function SignInSection() {
  const accounts = useAccounts();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (accounts.status === 'signedIn' && accounts.user) {
    return (
      <View>
        <Text>Signed in as {accounts.user.email ?? accounts.user.id}</Text>
        <Button title="Sign out" onPress={() => void accounts.signOut()} />
      </View>
    );
  }

  const report = (result: {status: string; message?: string}) => {
    setError(result.status === 'error' ? result.message ?? 'Failed' : null);
  };

  return (
    <View>
      {Platform.OS === 'ios' && (
        <Button
          title="Continue with Apple"
          onPress={async () => report(await accounts.signInWithApple())}
        />
      )}
      <Button
        title="Continue with Google"
        onPress={async () => report(await accounts.signInWithGoogle())}
      />
      {!otpSent ? (
        <>
          <TextInput
            placeholder="Email"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <Button
            title="Send code"
            onPress={async () => {
              const r = await accounts.requestEmailOtp(email.trim());
              setOtpSent(r.sent);
              setError(r.sent ? null : r.message ?? 'Failed');
            }}
          />
        </>
      ) : (
        <>
          <TextInput
            placeholder="6-digit code"
            keyboardType="number-pad"
            value={code}
            onChangeText={setCode}
          />
          <Button
            title="Verify"
            onPress={async () =>
              report(await accounts.verifyEmailOtp(email.trim(), code.trim()))
            }
          />
        </>
      )}
      {error != null && <Text>{error}</Text>}
    </View>
  );
}
```

- [ ] **Step 5: Run harness (unchanged files still green)**

```bash
npm test && npm run typecheck
```
Expected: PASS (provider/UI files are outside the harness scope by design).

- [ ] **Step 6: Commit**

```bash
git add modules/accounts/template/lib/accounts/provider.tsx modules/accounts/template/lib/accounts/sync-registry.ts modules/accounts/template/lib/accounts/index.ts modules/accounts/template/components/accounts/SignInSection.tsx
git commit -m "feat(accounts): AccountsProvider, app-owned sync registry, example sign-in UI"
```

---

### Task 6: Postgres migrations

**Files:**
- Create: `modules/accounts/template/supabase/migrations/0001_accounts_core.sql`
- Create: `modules/accounts/template/supabase/migrations/0002_shares.sql`

**Interfaces:**
- Produces: tables `profiles`, `user_state`, `apple_credentials`, `shares` consumed by client.ts (task 3) and the edge functions (task 7). Column names must match exactly: `user_state(user_id, namespace, data, updated_at)`; `apple_credentials(user_id, refresh_token, updated_at)`.

- [ ] **Step 1: Write `0001_accounts_core.sql`**

```sql
-- accounts module: core tables (profiles, user_state, apple_credentials)
-- Vendored by apps-tooling/modules/accounts. Apply with `supabase db push`.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: owner can read"
  on public.profiles for select using (auth.uid() = id);
create policy "profiles: owner can update"
  on public.profiles for update using (auth.uid() = id);

-- Auto-create a profile row for every new auth user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- One row per synced namespace per user; payload is opaque jsonb.
create table public.user_state (
  user_id uuid not null references auth.users (id) on delete cascade,
  namespace text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, namespace)
);

alter table public.user_state enable row level security;

create policy "user_state: owner full access"
  on public.user_state for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Apple refresh tokens for deletion-time revocation (TN3194).
-- RLS enabled with NO policies: only the service role (edge functions) can
-- read or write. Never expose this table to clients.
create table public.apple_credentials (
  user_id uuid primary key references auth.users (id) on delete cascade,
  refresh_token text not null,
  updated_at timestamptz not null default now()
);

alter table public.apple_credentials enable row level security;
```

- [ ] **Step 2: Write `0002_shares.sql`**

```sql
-- accounts module: user-to-user shares (share-by-reference).
-- book_ref/item_ref semantics are app-defined; ids must be resolvable on the
-- recipient's device (catalog ids, not device-local ids).

create table public.shares (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users (id) on delete cascade,
  item_ref text not null,
  note text,
  created_at timestamptz not null default now(),
  claimed_by uuid references auth.users (id) on delete set null,
  claimed_at timestamptz
);

alter table public.shares enable row level security;

create policy "shares: sender can insert own"
  on public.shares for insert
  with check (auth.uid() = sender_id);

-- Senders and claimants see their shares; any signed-in holder of an
-- unclaimed share id can read it (ids are unguessable uuids in deep links).
create policy "shares: visible to sender, claimant, or unclaimed"
  on public.shares for select
  using (
    auth.uid() = sender_id
    or auth.uid() = claimed_by
    or claimed_by is null
  );

-- Claiming: any signed-in user may claim an unclaimed share for themselves.
create policy "shares: claim an unclaimed share"
  on public.shares for update
  using (claimed_by is null and auth.uid() is not null)
  with check (claimed_by = auth.uid());
```

- [ ] **Step 3: Commit**

```bash
git add modules/accounts/template/supabase/migrations
git commit -m "feat(accounts): core + shares migrations with RLS"
```

---

### Task 7: Edge functions (Deno)

**Files:**
- Create: `modules/accounts/template/supabase/functions/_shared/apple.ts`
- Create: `modules/accounts/template/supabase/functions/apple-token-exchange/index.ts`
- Create: `modules/accounts/template/supabase/functions/delete-account/index.ts`
- Create: `modules/accounts/template/supabase/functions/revenuecat-webhook/index.ts`

**Interfaces:**
- Consumes: tables from task 6 (`apple_credentials`, and cascade deletes on `profiles`/`user_state`/`shares`).
- Produces: functions invoked by client (`apple-token-exchange` with `{authorization_code}`, `delete-account` with no body). Secrets consumed (set via `supabase secrets set`): `APPLE_TEAM_ID`, `APPLE_CLIENT_ID`, `APPLE_KEY_ID`, `APPLE_P8_KEY`, `RC_WEBHOOK_SECRET`. `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` are auto-injected by the platform.
- Deploy note (goes in SKILL.md): `revenuecat-webhook` is deployed with `--no-verify-jwt` (external caller); the other two keep JWT verification on.

- [ ] **Step 1: Write `_shared/apple.ts`**

```ts
/**
 * Apple Sign in REST helpers (CORE FILE — overwritten on blueprint re-sync).
 *
 * Runs ONLY in Supabase edge functions (Deno). Builds the ES256 client_secret
 * JWT from the app's .p8 key and wraps the /auth/token and /auth/revoke
 * endpoints (TN3194: exchange the authorizationCode at sign-in, store the
 * refresh token, revoke it at account deletion).
 *
 * Required function secrets: APPLE_TEAM_ID, APPLE_CLIENT_ID (the iOS bundle
 * id), APPLE_KEY_ID, APPLE_P8_KEY (full PEM contents of the .p8 file).
 */
import {SignJWT, importPKCS8} from 'npm:jose@5';

const APPLE_AUDIENCE = 'https://appleid.apple.com';

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing function secret: ${name}`);
  }
  return value;
}

export function appleConfigured(): boolean {
  return Boolean(
    Deno.env.get('APPLE_TEAM_ID') &&
      Deno.env.get('APPLE_CLIENT_ID') &&
      Deno.env.get('APPLE_KEY_ID') &&
      Deno.env.get('APPLE_P8_KEY'),
  );
}

async function makeClientSecret(): Promise<string> {
  const key = await importPKCS8(env('APPLE_P8_KEY'), 'ES256');
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({alg: 'ES256', kid: env('APPLE_KEY_ID')})
    .setIssuer(env('APPLE_TEAM_ID'))
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .setAudience(APPLE_AUDIENCE)
    .setSubject(env('APPLE_CLIENT_ID'))
    .sign(key);
}

async function appleForm(
  path: '/auth/token' | '/auth/revoke',
  params: Record<string, string>,
): Promise<Response> {
  const body = new URLSearchParams({
    client_id: env('APPLE_CLIENT_ID'),
    client_secret: await makeClientSecret(),
    ...params,
  });
  return fetch(`${APPLE_AUDIENCE}${path}`, {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body,
  });
}

/** Exchanges a sign-in authorizationCode for a refresh token. */
export async function exchangeAuthorizationCode(
  code: string,
): Promise<string | null> {
  const res = await appleForm('/auth/token', {
    grant_type: 'authorization_code',
    code,
  });
  if (!res.ok) {
    console.error('apple token exchange failed', res.status, await res.text());
    return null;
  }
  const json = (await res.json()) as {refresh_token?: string};
  return json.refresh_token ?? null;
}

/** Revokes a stored refresh token. Returns true when Apple accepted it. */
export async function revokeRefreshToken(token: string): Promise<boolean> {
  const res = await appleForm('/auth/revoke', {
    token,
    token_type_hint: 'refresh_token',
  });
  if (!res.ok) {
    console.error('apple revoke failed', res.status, await res.text());
  }
  return res.ok;
}
```

- [ ] **Step 2: Write `apple-token-exchange/index.ts`**

```ts
/**
 * apple-token-exchange (CORE FILE — overwritten on blueprint re-sync).
 *
 * Called (best effort) right after a native Apple sign-in with the
 * authorizationCode. Exchanges it for a refresh token and stores it in
 * apple_credentials so delete-account can revoke it later (App Store
 * guideline 5.1.1(v) / TN3194). Deployed WITH JWT verification: only
 * signed-in users can reach it.
 */
import {createClient} from 'jsr:@supabase/supabase-js@2';
import {appleConfigured, exchangeAuthorizationCode} from '../_shared/apple.ts';

Deno.serve(async req => {
  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {global: {headers: {Authorization: authHeader}}},
  );
  const {
    data: {user},
  } = await userClient.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({error: 'unauthorized'}), {status: 401});
  }
  if (!appleConfigured()) {
    console.warn('apple secrets not configured; skipping token exchange');
    return new Response(JSON.stringify({stored: false}), {status: 200});
  }
  const {authorization_code} = (await req.json()) as {
    authorization_code?: string;
  };
  if (!authorization_code) {
    return new Response(JSON.stringify({error: 'authorization_code required'}), {
      status: 400,
    });
  }
  const refreshToken = await exchangeAuthorizationCode(authorization_code);
  if (!refreshToken) {
    return new Response(JSON.stringify({stored: false}), {status: 200});
  }
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const {error} = await admin.from('apple_credentials').upsert({
    user_id: user.id,
    refresh_token: refreshToken,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.error('storing apple credential failed', error.message);
    return new Response(JSON.stringify({stored: false}), {status: 200});
  }
  return new Response(JSON.stringify({stored: true}), {status: 200});
});
```

- [ ] **Step 3: Write `delete-account/index.ts`**

```ts
/**
 * delete-account (CORE FILE — overwritten on blueprint re-sync).
 *
 * True account deletion per App Store guideline 5.1.1(v): revokes the stored
 * Apple refresh token (TN3194), then deletes the auth user. All user rows
 * (profiles, user_state, apple_credentials, shares) go via ON DELETE CASCADE.
 * Deployed WITH JWT verification: users can only delete themselves.
 */
import {createClient} from 'jsr:@supabase/supabase-js@2';
import {appleConfigured, revokeRefreshToken} from '../_shared/apple.ts';

Deno.serve(async req => {
  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {global: {headers: {Authorization: authHeader}}},
  );
  const {
    data: {user},
  } = await userClient.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({error: 'unauthorized'}), {status: 401});
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Best-effort Apple revocation; deletion proceeds regardless (Apple's
  // fallback guidance applies when no token is held).
  if (appleConfigured()) {
    const {data: cred} = await admin
      .from('apple_credentials')
      .select('refresh_token')
      .eq('user_id', user.id)
      .maybeSingle();
    if (cred?.refresh_token) {
      await revokeRefreshToken(cred.refresh_token);
    }
  }

  const {error} = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error('deleteUser failed', error.message);
    return new Response(JSON.stringify({error: 'deletion failed'}), {
      status: 500,
    });
  }
  return new Response(JSON.stringify({deleted: true}), {status: 200});
});
```

- [ ] **Step 4: Write `revenuecat-webhook/index.ts`** (documented stub)

```ts
/**
 * revenuecat-webhook (CORE FILE — overwritten on blueprint re-sync).
 *
 * STUB until the payments phase. Wire-up when RevenueCat lands:
 *   1. Create an entitlements table (user_id, entitlement, expires_at, source).
 *   2. On webhook: call GET /v1/subscribers/{app_user_id} (RevenueCat's
 *      recommended pattern) and upsert the normalized entitlement state.
 *   3. Set app_user_id = the Supabase user id in the app's Purchases.logIn().
 *
 * Deploy with --no-verify-jwt (RevenueCat is the caller, not a user) and set
 * the same secret in RevenueCat's webhook Authorization header config and in
 * the RC_WEBHOOK_SECRET function secret.
 */
Deno.serve(async req => {
  const secret = Deno.env.get('RC_WEBHOOK_SECRET');
  if (!secret || req.headers.get('Authorization') !== `Bearer ${secret}`) {
    return new Response('unauthorized', {status: 401});
  }
  const payload = (await req.json()) as {event?: {type?: string}};
  console.log('revenuecat webhook received:', payload.event?.type ?? 'unknown');
  return new Response(JSON.stringify({received: true}), {status: 200});
});
```

- [ ] **Step 5: Commit**

```bash
git add modules/accounts/template/supabase/functions
git commit -m "feat(accounts): edge functions (apple token exchange, account deletion, RC webhook stub)"
```

---

### Task 8: `accounts-authoring-rule.md` + `blueprint.json`

**Files:**
- Create: `modules/accounts/template/accounts-authoring-rule.md`
- Create: `modules/accounts/blueprint.json`

- [ ] **Step 1: Write the authoring rule** (fenced like the analytics one)

```markdown
<!-- BEGIN accounts-authoring-rule (managed by apps-tooling/modules/accounts) -->
## Accounts and sync (required when touching user data)

- The account is optional. Every feature must work signed-out; sync mirrors
  local state, it never gates it.
- New local state that should follow the user across devices MUST be
  registered as a namespace in `lib/accounts/sync-registry.ts` with an explicit
  merge rule (max for counters/furthest-progress, union for collections,
  last-write-wins for preferences). After local writes, call
  `queuePush('<namespace>')` from `useAccounts()`.
- Never import `@supabase/supabase-js` outside `lib/accounts/client.ts`.
- Every new user-data table needs: RLS owner policies, `on delete cascade`
  from `auth.users`, and (if it holds personal data) coverage by the
  `delete-account` edge function. Account deletion must stay TRUE deletion
  (App Store guideline 5.1.1(v)).
- Auth analytics events to use (see `lib/analytics/events.ts`):
  `Sign In Started` / `Sign In Completed` / `Sign In Failed` (prop `method`:
  apple|google|email), `Signed Out`, `Account Deleted`, `Sync Completed`.
  Never put emails, tokens, or share note content in analytics properties.
<!-- END accounts-authoring-rule -->
```

- [ ] **Step 2: Write `blueprint.json`**

Schema note: this module extends the analytics blueprint schema with `"scope"` on env entries, and new top-level `"native"` and `"backend"` sections. The skill is the consumer; a future generic CLI should treat unknown sections as opaque.

```json
{
  "name": "accounts",
  "displayName": "Accounts (Supabase)",
  "description": "Accounts + cross-device sync via Supabase, behind a thin app-owned wrapper. Native Sign in with Apple (iOS), native Google sign-in, email OTP, namespace sync engine, share-by-reference tables, App-Store-compliant account deletion, RevenueCat webhook stub.",
  "version": "0.1.0",
  "provider": "supabase",
  "install": {
    "expo": [
      "expo-apple-authentication",
      "@react-native-google-signin/google-signin"
    ],
    "npm": ["@supabase/supabase-js", "react-native-url-polyfill"],
    "peer": ["@react-native-async-storage/async-storage"],
    "ios": {"podInstall": true},
    "notes": [
      "Requires a development build (native sign-in modules do not run in Expo Go).",
      "Check `npm ls @react-native-async-storage/async-storage` after install: exactly one version. If a dependency pins another copy, add an override in package.json (see the analytics module's npmOverrides for the pattern).",
      "expo-apple-authentication is iOS-only. Hide Apple sign-in UI on Android; Google + email OTP cover Android."
    ]
  },
  "env": {
    "EXPO_PUBLIC_SUPABASE_URL": {
      "scope": "client",
      "required": true,
      "prompt": "Supabase project URL (Dashboard > Settings > API > Project URL):",
      "description": "Public project URL. Safe to ship in the app bundle."
    },
    "EXPO_PUBLIC_SUPABASE_ANON_KEY": {
      "scope": "client",
      "required": true,
      "prompt": "Supabase anon/public API key (Dashboard > Settings > API):",
      "description": "Public client key. RLS is the security boundary; safe to ship."
    },
    "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID": {
      "scope": "client",
      "required": false,
      "prompt": "Google OAuth WEB client id (Google Cloud Console > Credentials). Needed for Google sign-in; leave blank to skip:",
      "description": "The WEB client id (not iOS/Android). The native library exchanges it for tokens Supabase accepts. Public value."
    },
    "APPLE_TEAM_ID": {
      "scope": "server",
      "required": true,
      "setVia": "supabase secrets set APPLE_TEAM_ID=...",
      "description": "Apple developer team id. Function secret only, NEVER in the app bundle or EXPO_PUBLIC_*."
    },
    "APPLE_CLIENT_ID": {
      "scope": "server",
      "required": true,
      "setVia": "supabase secrets set APPLE_CLIENT_ID=...",
      "description": "The iOS bundle identifier (the App ID used for Sign in with Apple). Function secret."
    },
    "APPLE_KEY_ID": {
      "scope": "server",
      "required": true,
      "setVia": "supabase secrets set APPLE_KEY_ID=...",
      "description": "Key id of the Sign in with Apple .p8 key. Function secret."
    },
    "APPLE_P8_KEY": {
      "scope": "server",
      "required": true,
      "setVia": "supabase secrets set APPLE_P8_KEY=\"$(cat AuthKey_XXXX.p8)\"",
      "description": "Full PEM contents of the .p8 private key. Function secret. NEVER commit or bundle."
    },
    "RC_WEBHOOK_SECRET": {
      "scope": "server",
      "required": false,
      "setVia": "supabase secrets set RC_WEBHOOK_SECRET=...",
      "description": "Shared secret for the RevenueCat webhook (payments phase). Also set as the Authorization header value in RevenueCat's webhook config."
    }
  },
  "files": [
    {"from": "template/lib/accounts/types.ts", "to": "lib/accounts/types.ts", "ownership": "core"},
    {"from": "template/lib/accounts/config.ts", "to": "lib/accounts/config.ts", "ownership": "core"},
    {"from": "template/lib/accounts/client.ts", "to": "lib/accounts/client.ts", "ownership": "core"},
    {"from": "template/lib/accounts/sync.ts", "to": "lib/accounts/sync.ts", "ownership": "core"},
    {"from": "template/lib/accounts/signin-apple.ts", "to": "lib/accounts/signin-apple.ts", "ownership": "core"},
    {"from": "template/lib/accounts/signin-google.ts", "to": "lib/accounts/signin-google.ts", "ownership": "core"},
    {"from": "template/lib/accounts/signin-email.ts", "to": "lib/accounts/signin-email.ts", "ownership": "core"},
    {"from": "template/lib/accounts/provider.tsx", "to": "lib/accounts/provider.tsx", "ownership": "core"},
    {"from": "template/lib/accounts/index.ts", "to": "lib/accounts/index.ts", "ownership": "core"},
    {"from": "template/lib/accounts/sync-registry.ts", "to": "lib/accounts/sync-registry.ts", "ownership": "app"},
    {"from": "template/components/accounts/SignInSection.tsx", "to": "components/accounts/SignInSection.tsx", "ownership": "app"},
    {"from": "template/supabase/migrations/0001_accounts_core.sql", "to": "supabase/migrations/0001_accounts_core.sql", "ownership": "core"},
    {"from": "template/supabase/migrations/0002_shares.sql", "to": "supabase/migrations/0002_shares.sql", "ownership": "core"},
    {"from": "template/supabase/functions/_shared/apple.ts", "to": "supabase/functions/_shared/apple.ts", "ownership": "core"},
    {"from": "template/supabase/functions/apple-token-exchange/index.ts", "to": "supabase/functions/apple-token-exchange/index.ts", "ownership": "core"},
    {"from": "template/supabase/functions/delete-account/index.ts", "to": "supabase/functions/delete-account/index.ts", "ownership": "core"},
    {"from": "template/supabase/functions/revenuecat-webhook/index.ts", "to": "supabase/functions/revenuecat-webhook/index.ts", "ownership": "core"}
  ],
  "native": {
    "ios": {
      "usesAppleSignIn": true,
      "entitlements": {"com.apple.developer.applesignin": ["Default"]},
      "notes": [
        "CNG/prebuild apps: set expo.ios.usesAppleSignIn=true in app.json; the expo-apple-authentication plugin writes the entitlement at prebuild.",
        "Bare apps (git-tracked ios/): add the Sign in with Apple capability in Xcode (Signing & Capabilities) which creates/updates the .entitlements file. EAS capability sync enables it on the App ID at build time."
      ]
    },
    "android": {
      "intentFilters": [
        {
          "purpose": "share links / future OAuth fallback",
          "note": "Register the app's custom scheme (expo.scheme on CNG; a VIEW intent-filter with android:scheme in AndroidManifest.xml on bare). Native sign-in itself does NOT need it, but share deep links do."
        }
      ]
    }
  },
  "backend": {
    "provider": "supabase",
    "migrationsDir": "supabase/migrations",
    "functions": [
      {"name": "apple-token-exchange", "verifyJwt": true},
      {"name": "delete-account", "verifyJwt": true},
      {"name": "revenuecat-webhook", "verifyJwt": false}
    ],
    "dashboard": [
      "Authentication > Providers > Apple: enable; add the iOS bundle id to Client IDs (native flow needs no secret).",
      "Authentication > Providers > Google: enable; set the WEB client id in Client IDs; enable 'Skip Nonce Check' (the free native library cannot pass a custom nonce).",
      "Authentication > Providers > Email: enable; ensure the OTP email template contains {{ .Token }} so users get a 6-digit code.",
      "Authentication > Settings: disable 'Confirm email' double-opt-in only if OTP sign-up friction matters; default is fine."
    ]
  },
  "wiring": {
    "wrapRoot": {
      "component": "AccountsProvider",
      "importFrom": "./lib/accounts",
      "placement": "inside-analytics-above-data-providers",
      "placementNote": "NOT outermost (analytics owns that). Place directly inside <AnalyticsProvider> and above the app's data/state providers so they can react to auth. Pass onAuthEvent to identify the user in analytics.",
      "entryCandidates": ["app/_layout.tsx", "App.tsx", "src/App.tsx", "index.tsx"]
    }
  },
  "governance": {
    "policy": "The account is optional: features must work signed-out. New synced state registers a namespace + merge rule in sync-registry.ts. New user-data tables need RLS + cascade + delete-account coverage.",
    "agentInstructions": {
      "appendFrom": "template/accounts-authoring-rule.md",
      "to": ["CLAUDE.md", "AGENTS.md"],
      "note": "Append (never overwrite); fenced with BEGIN/END markers for in-place re-sync."
    }
  },
  "verify": [
    "npx tsc --noEmit passes in the app",
    "EXPO_PUBLIC_SUPABASE_URL and _ANON_KEY set in .env AND as EAS env vars",
    "supabase db push applied both migrations; supabase functions deployed (revenuecat-webhook with --no-verify-jwt)",
    "On a dev build: Apple sign-in (iOS), Google sign-in, and email OTP each produce a session; profiles row auto-created",
    "apple_credentials row exists after Apple sign-in (token exchange worked)",
    "Account deletion from the app removes the auth user and cascades all rows",
    "Sync round-trip: change a registered namespace on device A, relaunch app on device B, value arrives"
  ]
}
```

- [ ] **Step 3: Commit**

```bash
git add modules/accounts/template/accounts-authoring-rule.md modules/accounts/blueprint.json
git commit -m "feat(accounts): blueprint manifest (env scoping, native + backend sections) and authoring rule"
```

---

### Task 9: `SKILL.md`, module `README.md`, root README row

**Files:**
- Create: `modules/accounts/SKILL.md`
- Create: `modules/accounts/README.md`
- Modify: `README.md` (root): change the modules table row `| profile | planned | ... |` area: add `| [accounts](./modules/accounts) | 🚧 v0.1 | Accounts + sync via Supabase |` above the planned rows, and remove the planned `profile` row (superseded by accounts).

- [ ] **Step 1: Write `SKILL.md`**

Frontmatter + steps, mirroring setup-analytics's voice. Full content:

```markdown
---
name: setup-accounts
description: Add accounts + cross-device sync (Supabase, via the apps-tooling blueprint) to the current Expo / React Native app. Use when the user wants accounts, sign-in/login (Apple, Google, email), profile backend, settings/progress sync, or says "set up accounts". Vendors an app-owned wrapper, provisions the Supabase backend (migrations + edge functions), wires the root provider, and walks through the Apple/Google console setup.
---

# setup-accounts

Vendors the `accounts` blueprint from the **apps-tooling** repo into the current
Expo / React Native app (Route B: the app owns a copy). The backend is Supabase,
hidden behind a thin wrapper so app code never imports supabase-js directly.
Native Sign in with Apple (iOS) + native Google + email OTP; local-first
namespace sync; true account deletion (App Store 5.1.1(v)) including Apple
token revocation.

## What this produces in the target app

- `lib/accounts/` wrapper (all CORE except `sync-registry.ts`, which is APP-OWNED).
- `components/accounts/SignInSection.tsx` example UI (APP-OWNED; restyle it).
- `supabase/` migrations + edge functions (CORE), applied to the app's own
  Supabase project.
- `<AccountsProvider>` wired inside `<AnalyticsProvider>`, above data providers.
- Client env in `.env` + EAS; server secrets as Supabase function secrets.
- The accounts authoring rule appended to `CLAUDE.md` / `AGENTS.md`.

## Prerequisites to confirm with the user before starting

1. A Supabase project for THIS app (one project per app). Create at
   database.new if missing; you need the project ref, URL, and anon key.
2. The Supabase CLI (`supabase --version`), logged in and linked
   (`supabase link --project-ref <ref>`).
3. Apple: a Sign in with Apple key (.p8) from developer.apple.com
   (Certificates, Identifiers & Profiles > Keys), the Team ID, Key ID, and the
   app's bundle id with the Sign in with Apple capability on its App ID.
4. Google (optional but recommended): OAuth clients in Google Cloud Console:
   a WEB client (its id goes in the env var) plus iOS/Android clients matching
   the app's bundle id / package name + SHA-1.
5. A dev-build workflow (native modules; Expo Go will not work).

## Steps

Create a todo per step and work through them in order.

1. **Locate the blueprint.** Find `apps-tooling` (usually a sibling of the
   app). Read `modules/accounts/blueprint.json`: it is the source of truth for
   files, deps, env, native config, and backend setup.

2. **Confirm compatibility.** Expo/RN app with dev builds. Detect the entry
   point from `blueprint.wiring.wrapRoot.entryCandidates`. Note whether the
   app is CNG (no git-tracked ios/) or bare (git-tracked ios/): it changes
   step 6.

3. **Copy files** per `blueprint.files`, honoring the ownership rule:
   overwrite `core`, never clobber existing `app` files (`sync-registry.ts`,
   `SignInSection.tsx`).

4. **Install deps.** `npx expo install` each `blueprint.install.expo` entry;
   `npm install` each `blueprint.install.npm` entry. Then verify a single
   async-storage: `npm ls @react-native-async-storage/async-storage` (one
   version; if a duplicate appears, add a package.json override, same pattern
   as the analytics module). If bare iOS: `cd ios && pod install`.

5. **Provision the backend.** Copy the vendored `supabase/` dir is already
   done by step 3; now run `supabase db push` (applies both migrations), then
   deploy functions: `supabase functions deploy apple-token-exchange`,
   `supabase functions deploy delete-account`, and
   `supabase functions deploy revenuecat-webhook --no-verify-jwt`.

6. **Native config** (from `blueprint.native`). CNG: set
   `expo.ios.usesAppleSignIn: true` and `expo.scheme` in app.json, then
   `npx expo prebuild`. Bare: add the Sign in with Apple capability in Xcode
   (creates the .entitlements) and, for share links, a VIEW intent-filter with
   the app's scheme in AndroidManifest.xml. EAS capability sync handles the
   App ID capability at build time.

7. **Dashboard config** (from `blueprint.backend.dashboard`): enable Apple
   (client id = iOS bundle id), Google (WEB client id + Skip Nonce Check),
   and Email providers in the Supabase dashboard. Walk the user through each.

8. **Env + secrets.** Client entries (`scope: client`) go to `.env`
   (gitignored) AND EAS env vars (`eas env:create`). Server entries
   (`scope: server`) are set ONLY via `supabase secrets set` (use each
   entry's `setVia`). Never put a server secret in EXPO_PUBLIC_* or .env.

9. **Wire the root.** Wrap the app inside `<AccountsProvider>` per
   `blueprint.wiring.wrapRoot.placementNote`: directly inside
   `<AnalyticsProvider>`, above the app's data providers. Wire `onAuthEvent`
   to analytics (identify on signed_in, reset on signed_out).

10. **Register sync namespaces.** With the app owner, list which local stores
    should sync, then fill `sync-registry.ts` with load/save/merge per
    namespace and add `queuePush('<ns>')` calls after local writes. Merge
    rules: max for counters/furthest-progress, union for collections, LWW for
    preferences.

11. **Governance.** Append `accounts-authoring-rule.md` to the app's
    `CLAUDE.md`/`AGENTS.md` between the BEGIN/END markers (replace in place on
    re-sync).

12. **Verify** per `blueprint.verify`: tsc, all three sign-in methods on a dev
    build, apple_credentials row present, deletion cascade, and a two-device
    sync round-trip.

## Notes

- Accounts are optional by design: the app must remain fully usable signed
  out. Sync mirrors local state; it never gates features.
- Re-running this skill re-syncs core files; `sync-registry.ts` and the
  example UI are preserved.
- The RevenueCat webhook is a documented stub until the payments phase.
- To swap backends later, rewrite `client.ts` + `config.ts` and the
  `supabase/` dir; app code, the registry, and the provider API are untouched.
```

- [ ] **Step 2: Write module `README.md`**

Full content (what/why/files/ownership/usage/extend, mirroring the analytics README structure):

```markdown
# accounts

Accounts + cross-device sync for Expo/RN apps, on Supabase, behind a thin
app-owned wrapper. Native Sign in with Apple (iOS), native Google sign-in,
email OTP (passwordless 6-digit code), a local-first namespace sync engine,
share-by-reference tables, true account deletion (App Store 5.1.1(v),
including Apple token revocation per TN3194), and a RevenueCat webhook stub
for the future payments phase.

Design rationale and the verified research behind every choice:
`daily-book/docs/accounts-research.md` (sibling repo).

## Why a wrapper

`client.ts` is the only file importing `@supabase/supabase-js`; app code uses
`useAccounts()` and the typed helpers. Swapping backends later means rewriting
`client.ts`/`config.ts` and the `supabase/` dir; screens and the sync registry
survive.

## Install into an app

Run the skill: symlink this module to `~/.claude/skills/setup-accounts`, then
run `/setup-accounts` in the app. Manual path: follow `blueprint.json` +
SKILL.md by hand.

## Files and ownership

| File | Ownership | Role |
|---|---|---|
| `lib/accounts/config.ts` | core | env (public client values only) |
| `lib/accounts/client.ts` | core | the ONLY supabase-js import; transport + function invoker |
| `lib/accounts/types.ts` | core | shared types |
| `lib/accounts/sync.ts` | core | pure sync engine (tested in this repo) |
| `lib/accounts/signin-*.ts` | core | Apple / Google / email OTP flows |
| `lib/accounts/provider.tsx` | core | `<AccountsProvider>` + `useAccounts()` |
| `lib/accounts/index.ts` | core | barrel |
| `lib/accounts/sync-registry.ts` | app | YOUR namespaces + merge rules |
| `components/accounts/SignInSection.tsx` | app | example UI; restyle or replace |
| `supabase/migrations/*.sql` | core | profiles, user_state, apple_credentials, shares |
| `supabase/functions/*` | core | apple-token-exchange, delete-account, revenuecat-webhook |

## The local-first contract

Local storage stays the source of truth. The engine mirrors registered
namespaces: `syncAll()` on sign-in/foreground (pull, merge, save, push diff),
`queuePush()` debounced after local writes, `flush()` on background/sign-out.
Merge is per-namespace and app-defined; the engine never invents semantics.

## Gotchas (hard-won)

- Google sign-in needs the WEB client id in the env var, not the iOS/Android
  ones, and "Skip Nonce Check" enabled on the Supabase Google provider (the
  free native library cannot pass a custom nonce).
- Apple only returns the user's name on the FIRST authorization ever; the
  wrapper persists it then. To re-test, revoke the app under Settings > Apple
  ID > Sign-In & Security.
- The Apple authorizationCode expires in minutes and is single-use; the
  refresh-token exchange must happen at sign-in time (the wrapper does it,
  best effort).
- `revenuecat-webhook` must be deployed with `--no-verify-jwt`; the other two
  functions keep JWT verification ON.

## Dev harness (this repo)

`npm test` runs the vitest suite for the pure sync engine; `npm run
typecheck` covers `types.ts`/`sync.ts`. RN-dependent template files are
typechecked in the consumer app (blueprint verify step), same as analytics.
```

- [ ] **Step 3: Update root `README.md` modules table**

Replace:
```markdown
| [analytics](./modules/analytics) | ✅ v1 | Product analytics via Amplitude |
| paywall | planned | Subscriptions / paywall |
| profile | planned | User profile screen + state |
| onboarding | planned | First-run onboarding flow |
```
with:
```markdown
| [analytics](./modules/analytics) | ✅ v1 | Product analytics via Amplitude |
| [accounts](./modules/accounts) | 🚧 v0.1 | Accounts + cross-device sync via Supabase (Apple/Google/email OTP) |
| paywall | planned | Subscriptions / paywall (RevenueCat; webhook stub ships with accounts) |
| onboarding | planned | First-run onboarding flow |
```

- [ ] **Step 4: Commit**

```bash
git add modules/accounts/SKILL.md modules/accounts/README.md README.md
git commit -m "docs(accounts): setup-accounts skill, module README, root module table"
```

---

### Task 10: Final verification + push

- [ ] **Step 1: Full harness run**

```bash
npm test && npm run typecheck
```
Expected: 9 tests pass, tsc clean.

- [ ] **Step 2: Blueprint sanity check**

```bash
node -e "const b=require('./modules/accounts/blueprint.json'); const fs=require('fs'); let bad=0; for (const f of b.files) { if (!fs.existsSync('modules/accounts/'+f.from)) { console.error('MISSING', f.from); bad=1; } } process.exit(bad)"
```
Expected: exits 0 (every blueprint file exists in template/).

- [ ] **Step 3: Self-review against the research doc**

Check each requirement from `daily-book/docs/accounts-research.md` section 6 maps to a shipped file. Check no em dashes in new prose (grep `—` over new .md files; the CORE FILE header marker is the allowed exception).

- [ ] **Step 4: Push and open PR**

```bash
git push -u origin feat/accounts-module
gh pr create --title "feat: accounts module (Supabase) — auth, sync, sharing, deletion" --body "..."
```

---

## Self-Review Notes (author)

- Spec coverage: auth (tasks 4, 5), sync (2, 3, 5), sharing tables (6), deletion + revocation (7), RevenueCat stub (7), reusability/blueprint (8, 9), governance (8). Profile screen UI and DailyBook application are explicitly OUT of scope (next project: run /setup-accounts on daily-book).
- Type consistency: `SignInResult`, `SyncTransport`, `NamespaceAdapter`, `AccountsApi` names checked across tasks 2-5.
- The `user_state.updated_at` set client-side in push (task 3) is advisory only; merge authority is the adapter, not the timestamp.
