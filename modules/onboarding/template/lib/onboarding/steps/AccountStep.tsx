/**
 * Account step wiring (APP-OWNED FILE — customize freely).
 *
 * This is the tie between onboarding and the `accounts` module. It reuses the
 * shipped `useAccounts()` (no new auth code): render your app's own styled
 * sign-in UI (Apple / Google / email code — the same calls as your Profile's
 * account section), and advance automatically once a session exists.
 *
 * Make this step `skippable: true` in your steps array so the shell shows a ✕
 * that continues without an account. Accounts are optional; onboarding must
 * complete with or without one.
 *
 * Import path assumes the accounts module is vendored at `lib/accounts`.
 */
import React, {useEffect} from 'react';
import {useAccounts} from '../../accounts';
import type {OnboardingStepApi} from '../OnboardingFlow';

export function AccountStep({
  api,
  children,
}: {
  api: OnboardingStepApi;
  /** Your styled sign-in UI (benefit lines + provider buttons + email code). */
  children: React.ReactNode;
}) {
  const {status} = useAccounts();

  // Advance the moment a session exists (sign-in succeeded on any provider).
  useEffect(() => {
    if (status === 'signedIn') {
      api.next();
    }
  }, [status, api]);

  return <>{children}</>;
}
