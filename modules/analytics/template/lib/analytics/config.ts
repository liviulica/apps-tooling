/**
 * Shared analytics config (CORE FILE — overwritten on blueprint re-sync).
 *
 * The Amplitude API key is read from an Expo public env var so it differs per
 * app/environment without code changes. Set EXPO_PUBLIC_AMPLITUDE_KEY in .env.
 */
export const ANALYTICS_API_KEY = process.env.EXPO_PUBLIC_AMPLITUDE_KEY ?? '';

/**
 * Privacy-leaning defaults shared by every app.
 * - Sessions are low-volume and high-value, so they stay on.
 * - Screen views are tracked manually via analytics.screen() to keep event
 *   volume predictable (Amplitude's free tier counts every event).
 * - IP capture is disabled by default.
 */
export const ANALYTICS_OPTIONS = {
  defaultTracking: {
    sessions: true,
    appLifecycles: false,
    deepLinks: false,
    screenViews: false,
  },
  trackingOptions: {
    ipAddress: false,
  },
  // serverZone: 'EU', // region is not a constraint for us; default is US.
};
