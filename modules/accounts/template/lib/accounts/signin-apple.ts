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
      .then(({error: profileError}) => {
        if (profileError && __DEV__) {
          console.warn('[accounts] saving display name failed:', profileError);
        }
      });
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
