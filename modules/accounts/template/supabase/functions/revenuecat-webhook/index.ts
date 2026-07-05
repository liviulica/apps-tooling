/**
 * revenuecat-webhook (CORE FILE — overwritten on blueprint re-sync).
 *
 * STUB until the payments phase. Wire-up when RevenueCat lands:
 *   1. Create an entitlements table (user_id, entitlement, expires_at, source).
 *   2. On webhook: call GET /v1/subscribers/{app_user_id} (RevenueCat's
 *      recommended pattern) and upsert the normalized entitlement state.
 *   3. Set app_user_id = the Supabase user id in the app's Purchases.logIn().
 *
 * Deploy with --no-verify-jwt (RevenueCat is the caller, not a user) and set
 * the same secret in RevenueCat's webhook Authorization header config and in
 * the RC_WEBHOOK_SECRET function secret.
 */
Deno.serve(async req => {
  const secret = Deno.env.get('RC_WEBHOOK_SECRET');
  if (!secret || req.headers.get('Authorization') !== `Bearer ${secret}`) {
    return new Response('unauthorized', {status: 401});
  }
  const payload = (await req.json()) as {event?: {type?: string}};
  console.log('revenuecat webhook received:', payload.event?.type ?? 'unknown');
  return new Response(JSON.stringify({received: true}), {status: 200});
});
