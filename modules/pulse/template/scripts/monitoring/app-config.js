'use strict';

/**
 * The app's identifiers (APP-OWNED FILE — NOT overwritten on blueprint
 * re-sync). Fill these in once, per app.
 *
 * None of these are secrets. They are public identifiers that already ship
 * inside the app or appear in a store listing, which is why they are
 * committed here rather than kept in .env.monitoring.local. Anything that
 * would embarrass you in a git history belongs in that file instead.
 *
 * A blank value does not crash anything: the source that needs it reports
 * `unavailable` naming what is missing, and the rest of the run continues.
 */

/** App Store numeric app id, from the App Store Connect URL or a store link. */
const APP_STORE_APP_ID = '';

/** iOS bundle id / Android package name. Used in setup docs and messages. */
const BUNDLE_ID = '';

/** Firebase project id, for the Crashlytics section of the setup doc. */
const FIREBASE_PROJECT_ID = '';

/** Supabase project ref (the subdomain of your project URL). Leave '' if the app has no backend. */
const SUPABASE_PROJECT_REF = '';

/**
 * Storefronts to read the public star average from.
 *
 * App Store Connect has NO endpoint for ratings, and its reviews endpoint
 * hides every rating that carries no text, so the only way to see stars is
 * the public iTunes lookup, one country at a time. Pick the markets you
 * actually care about: each one is a request.
 */
const RATING_STOREFRONTS = ['us', 'gb', 'de', 'fr'];

module.exports = {
  APP_STORE_APP_ID,
  BUNDLE_ID,
  FIREBASE_PROJECT_ID,
  SUPABASE_PROJECT_REF,
  RATING_STOREFRONTS,
};
