/**
 * Crash reporting (Firebase Crashlytics), behind the app's own wrapper.
 *
 * Nothing outside this folder imports @react-native-firebase/* — the same
 * one-door rule the analytics and accounts stacks keep, so swapping the
 * provider is a change here, not across the app.
 *
 * Two contracts outrank the features:
 *
 * 1. LAZY, DEFENSIVE LOADING (the translate.ts lesson). The Firebase packages
 *    resolve their native half at import time; a binary built before they
 *    existed — every older TestFlight install the day this ships — would
 *    crash AT APP START on a static import. A missing module must read as
 *    "crash reporting unavailable", never a crash. The reporter must never be
 *    the thing that crashes the app.
 *
 * 2. NOTHING COLLECTED UNTIL THE READER'S SETTING SAYS SO. firebase.json
 *    ships every auto-collection flag off; the only thing that turns
 *    Crashlytics on is SettingsContext applying the Profile → Privacy switch
 *    after hydration (on by default, like analytics, but the reader's opt-out
 *    wins before the first byte leaves). The native SDK persists the flag, so
 *    crashes during the next launch's early window are still covered once a
 *    reader has been enabled at least once.
 *
 * Ship-dark: with no GoogleService-Info.plist / google-services.json in the
 * build, Firebase never configures and every call lands in a catch. The app
 * behaves identically; the wiring waits for the config files.
 *
 * Reasoning: docs/decisions/crash-reporting.md.
 */

type CrashlyticsSdk = typeof import('@react-native-firebase/crashlytics');

let sdk: CrashlyticsSdk | null | undefined;
function getSdk(): CrashlyticsSdk | null {
  if (sdk === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      sdk = require('@react-native-firebase/crashlytics') as CrashlyticsSdk;
    } catch {
      sdk = null;
    }
  }
  return sdk;
}

/** The crashlytics instance, or null when the module/config is absent. */
function instance() {
  const mod = getSdk();
  if (!mod) {
    return null;
  }
  try {
    return mod.getCrashlytics();
  } catch {
    return null;
  }
}

/**
 * Apply the reader's setting. Called by SettingsContext after hydration and
 * whenever the Privacy switch flips; the SDK persists the flag natively.
 */
export async function setCrashReportingEnabled(enabled: boolean): Promise<void> {
  const mod = getSdk();
  const c = instance();
  if (!mod || !c) {
    return;
  }
  try {
    await mod.setCrashlyticsCollectionEnabled(c, enabled);
  } catch {
    // Unconfigured Firebase (ship-dark) or an old binary: nothing to apply.
  }
}

/**
 * A handled error worth a report: ErrorBoundary catches, failed invariants.
 * `name` groups reports in the dashboard — a stable label, never free text.
 */
export function recordError(error: Error, name: string): void {
  const mod = getSdk();
  const c = instance();
  if (!mod || !c) {
    return;
  }
  try {
    mod.recordError(c, error, name);
  } catch {
    // Never let the reporter be the crash.
  }
}

/** A breadcrumb attached to the next report. No PII, no free text. */
export function logCrashBreadcrumb(message: string): void {
  const mod = getSdk();
  const c = instance();
  if (!mod || !c) {
    return;
  }
  try {
    mod.log(c, message);
  } catch {
    // Same contract as recordError.
  }
}

/** Developer row: force a native crash to verify the pipeline end to end. */
export function testCrash(): void {
  const mod = getSdk();
  const c = instance();
  if (!mod || !c) {
    return;
  }
  try {
    mod.crash(c);
  } catch {
    // Unconfigured: the "crash" quietly refuses, which is correct ship-dark.
  }
}
