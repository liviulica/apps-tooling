/**
 * Shared analytics config (CORE FILE — overwritten on blueprint re-sync).
 *
 * Both values come from Expo public env vars so they differ per app without code
 * changes:
 *   EXPO_PUBLIC_AMPLITUDE_KEY          — the project API key
 *   EXPO_PUBLIC_AMPLITUDE_SERVER_ZONE  — 'US' (default) or 'EU'. MUST match your
 *     Amplitude project's data region, or every event is silently dropped.
 */
export const ANALYTICS_API_KEY = process.env.EXPO_PUBLIC_AMPLITUDE_KEY ?? '';

const SERVER_ZONE: 'US' | 'EU' =
  process.env.EXPO_PUBLIC_AMPLITUDE_SERVER_ZONE === 'EU' ? 'EU' : 'US';

/**
 * Privacy-leaning defaults shared by every app.
 * - Sessions are low-volume and high-value, so they stay on.
 * - Screen views are tracked manually via analytics.screen() to keep event
 *   volume predictable (Amplitude's free tier counts every event).
 * - IP capture is disabled by default.
 */
export const ANALYTICS_OPTIONS = {
  serverZone: SERVER_ZONE,
  defaultTracking: {
    sessions: true,
    appLifecycles: false,
    deepLinks: false,
    screenViews: false,
  },
  trackingOptions: {
    ipAddress: false,
  },
};
