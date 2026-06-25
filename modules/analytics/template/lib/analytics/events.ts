/**
 * App event taxonomy (APP-OWNED FILE — NOT overwritten on blueprint re-sync).
 *
 * This is the ONLY analytics file you edit per app. Add your app's events to the
 * AnalyticsEvent union below and call `track('your_event', { ...props })`.
 *
 * Base events emitted automatically by <AnalyticsProvider> (keep these):
 *   'app_opened' | 'app_foregrounded' | 'app_backgrounded'
 * And by client.screen():
 *   'screen_viewed'
 *
 * Naming convention: snake_case, past tense (book_opened, search_performed).
 * Never put PII or free text (raw search queries, book content) in properties.
 */
import {track as clientTrack, screen, setUserProperties, reset} from './client';

export type AnalyticsEvent =
  | 'app_opened'
  | 'app_foregrounded'
  | 'app_backgrounded'
  | 'screen_viewed'
  // --- add your app's events below ---
  | 'example_event';

/** Type-safe event tracking. Use this throughout the app. */
export function track(event: AnalyticsEvent, props?: Record<string, unknown>): void {
  clientTrack(event, props);
}

export {screen, setUserProperties, reset};
