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
