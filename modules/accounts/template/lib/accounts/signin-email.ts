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
