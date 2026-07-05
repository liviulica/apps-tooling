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
