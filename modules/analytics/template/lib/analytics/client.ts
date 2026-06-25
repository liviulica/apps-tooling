/**
 * Amplitude client wrapper (CORE FILE — overwritten on blueprint re-sync).
 *
 * This is the ONLY file that imports the analytics provider SDK. App code never
 * touches Amplitude directly — it calls these functions (or the typed `track`
 * in events.ts). To swap providers, this is the single file you rewrite.
 *
 * All functions are safe to call before init() or when no API key is set: they
 * become no-ops rather than throwing, so analytics never breaks the app.
 */
import {
  init as amplitudeInit,
  track as amplitudeTrack,
  identify as amplitudeIdentify,
  reset as amplitudeReset,
  setOptOut,
  flush as amplitudeFlush,
  Identify,
} from '@amplitude/analytics-react-native';
import {ANALYTICS_API_KEY, ANALYTICS_OPTIONS} from './config';

let initialized = false;

export function init(): void {
  if (initialized) {
    return;
  }
  if (!ANALYTICS_API_KEY) {
    if (__DEV__) {
      console.warn(
        '[analytics] EXPO_PUBLIC_AMPLITUDE_KEY is not set — analytics is disabled.',
      );
    }
    return;
  }
  amplitudeInit(ANALYTICS_API_KEY, undefined, ANALYTICS_OPTIONS);
  initialized = true;
}

export function track(event: string, props?: Record<string, unknown>): void {
  if (!initialized) {
    return;
  }
  amplitudeTrack(event, props);
}

/** Tracked manually as an event because Amplitude screenViews are disabled. */
export function screen(name: string, props?: Record<string, unknown>): void {
  track('Screen Viewed', {screen: name, ...props});
}

export function setUserProperties(props: Record<string, unknown>): void {
  if (!initialized) {
    return;
  }
  const id = new Identify();
  for (const [key, value] of Object.entries(props)) {
    id.set(key, value as string | number | boolean);
  }
  amplitudeIdentify(id);
}

/** Clears the user id and generates a new anonymous device id (e.g. on logout). */
export function reset(): void {
  if (!initialized) {
    return;
  }
  amplitudeReset();
}

/**
 * Consent / opt-out toggle. Safe to call before init() so consent can be
 * applied early. enabled=false stops all tracking.
 */
export function setEnabled(enabled: boolean): void {
  setOptOut(!enabled);
}

/** Forces queued events to send. Useful right before backgrounding. */
export async function flush(): Promise<void> {
  if (!initialized) {
    return;
  }
  await amplitudeFlush().promise;
}
