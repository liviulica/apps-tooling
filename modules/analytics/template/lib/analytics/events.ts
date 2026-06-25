/**
 * App event taxonomy (APP-OWNED FILE — NOT overwritten on blueprint re-sync).
 *
 * The ONLY analytics file you edit per app. Add events to the AnalyticsEvent
 * union and call `track('Your Event', { ...props })`.
 *
 * Naming rules (see ../../event-guidelines.md — the single source of truth):
 *   - Event names: Object + Past-tense Verb, Title Case ('Book Opened').
 *   - Fixed strings only; variable data goes in props, never the name.
 *   - Property keys: snake_case; no PII or free text (no raw queries/content).
 *
 * Base events emitted automatically by <AnalyticsProvider> (keep these):
 *   'App Opened' | 'App Foregrounded' | 'App Backgrounded'
 * And by analytics.screen():
 *   'Screen Viewed'
 */
import {track as clientTrack, screen, setUserProperties, reset} from './client';

export type AnalyticsEvent =
  | 'App Opened'
  | 'App Foregrounded'
  | 'App Backgrounded'
  | 'Screen Viewed'
  // --- add your app's events below ---
  | 'Example Created';

/** Type-safe event tracking. Use this throughout the app. */
export function track(event: AnalyticsEvent, props?: Record<string, unknown>): void {
  clientTrack(event, props);
}

export {screen, setUserProperties, reset};
