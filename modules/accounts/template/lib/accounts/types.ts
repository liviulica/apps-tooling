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
