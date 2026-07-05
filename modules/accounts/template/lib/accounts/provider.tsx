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
