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
