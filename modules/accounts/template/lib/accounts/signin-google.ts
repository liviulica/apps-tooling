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
