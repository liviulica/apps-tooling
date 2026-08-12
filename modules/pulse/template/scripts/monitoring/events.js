'use strict';

/**
 * The events the pulse asks your analytics provider about (APP-OWNED FILE —
 * NOT overwritten on blueprint re-sync). Replace these with your app's own.
 *
 * These are strings and not imports on purpose: if your event taxonomy is a
 * TypeScript union (as in the analytics module's `AnalyticsEvent`), its
 * members do not exist at runtime and cannot be required from here.
 *
 * __tests__/monitoringAmplitude.test.ts parses that union out of the TS
 * source and fails if any name below has drifted out of it. A renamed event
 * must break a test, never silently flatten a funnel to zero. Point that test
 * at your taxonomy file and keep it.
 */

/** Does a new install become an engaged user? First step to last. */
const ACTIVATION_FUNNEL = [
  'App Opened',
  'Onboarding Started',
  'Onboarding Completed',
  // ... the first action that means the app worked for them
];

/**
 * Does the paywall convert? Keep the property that says which trigger opened
 * it: the aggregate rate is far less useful than knowing which door works.
 */
const MONETIZATION_FUNNEL = ['Paywall Viewed', 'Purchase Started', 'Purchase Completed'];

/** Is the app being USED, as opposed to opened? Pick the verbs of your product. */
const ENGAGEMENT_EVENTS = [];

/**
 * Things that should be rare. A rise here is the story of the week.
 *
 * Include the failures you already instrument (sync retries, playback
 * failures, purchase failures). An event here that your provider has never
 * received is reported as a real zero AND flagged, because it means either
 * nobody hits that path or the instrumentation is not wired up.
 */
const HEALTH_EVENTS = ['Purchase Failed'];

/** Retention is measured on the event every session emits. */
const RETENTION_EVENT = 'App Opened';

module.exports = {
  ACTIVATION_FUNNEL,
  MONETIZATION_FUNNEL,
  ENGAGEMENT_EVENTS,
  HEALTH_EVENTS,
  RETENTION_EVENT,
};
