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
