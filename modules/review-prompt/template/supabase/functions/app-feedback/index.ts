/**
 * app-feedback — the in-app feedback box's sink.
 *
 * Accepts one note per request and inserts it with the service role after
 * validation; the table has NO RLS policies, so this function is the entire
 * write path and nothing can read notes back from a device. Deployed with JWT
 * verification OFF (--no-verify-jwt): feedback must work signed out, and the
 * anon key in the Authorization header still identifies the project. When a
 * real session token arrives instead, the note is stamped with the user id so
 * account deletion (cascade) erases it.
 *
 * Abuse posture: length-capped, shape-validated, and per-IP rate limited via
 * a small in-memory bucket (an edge instance restart resets it, which is
 * fine: the cap exists to stop scripted floods, not determined attackers).
 */
import {createClient} from 'jsr:@supabase/supabase-js@2';

const MAX_LENGTH = 2000;
const PER_IP_PER_HOUR = 10;

const buckets = new Map<string, {count: number; resetAt: number}>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const bucket = buckets.get(ip);
  if (!bucket || now > bucket.resetAt) {
    buckets.set(ip, {count: 1, resetAt: now + 60 * 60 * 1000});
    return false;
  }
  bucket.count += 1;
  return bucket.count > PER_IP_PER_HOUR;
}

Deno.serve(async req => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({error: 'POST only'}), {status: 405});
  }
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (rateLimited(ip)) {
    return new Response(JSON.stringify({error: 'too many notes'}), {status: 429});
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({error: 'bad json'}), {status: 400});
  }
  const {message, app_version: appVersion, platform} = (body ?? {}) as Record<string, unknown>;
  if (typeof message !== 'string' || !message.trim() || message.length > MAX_LENGTH) {
    return new Response(JSON.stringify({error: 'bad message'}), {status: 400});
  }
  const version = typeof appVersion === 'string' ? appVersion.slice(0, 32) : '';
  const os = platform === 'ios' || platform === 'android' ? platform : '';

  // If the bearer token is a real session (not the anon key), stamp the note
  // with the user so account deletion erases it. Failure to resolve a user is
  // not an error: signed-out feedback is the normal case.
  let userId: string | null = null;
  const auth = req.headers.get('Authorization') ?? '';
  if (auth.startsWith('Bearer ')) {
    try {
      const asUser = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        {global: {headers: {Authorization: auth}}},
      );
      const {data} = await asUser.auth.getUser();
      userId = data.user?.id ?? null;
    } catch {
      userId = null;
    }
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const {error} = await admin.from('app_feedback').insert({
    message: message.trim(),
    app_version: version,
    platform: os,
    user_id: userId,
  });
  if (error) {
    console.error('app_feedback insert failed', error.message);
    return new Response(JSON.stringify({error: 'store failed'}), {status: 500});
  }
  return new Response(JSON.stringify({stored: true}), {status: 200});
});
