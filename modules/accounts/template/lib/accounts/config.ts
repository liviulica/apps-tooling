/**
 * Shared accounts config (CORE FILE — overwritten on blueprint re-sync).
 *
 * All values come from Expo public env vars so they differ per app without
 * code changes. All three are client-safe public values; row level security
 * is the actual security boundary. Server secrets (Apple .p8 key etc.) live
 * ONLY as Supabase function secrets, never in the app bundle.
 *
 *   EXPO_PUBLIC_SUPABASE_URL           — https://<project-ref>.supabase.co
 *   EXPO_PUBLIC_SUPABASE_ANON_KEY      — the project's anon/public API key
 *   EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID   — Google OAuth WEB client id (yes, the
 *     web one: the native library exchanges it for tokens Supabase accepts)
 */
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const GOOGLE_WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';

export const isConfigured = SUPABASE_URL !== '' && SUPABASE_ANON_KEY !== '';
