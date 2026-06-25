/**
 * Analytics public API (CORE FILE — overwritten on blueprint re-sync).
 *
 * Import everything from here:
 *   import {AnalyticsProvider, track, useAnalytics} from './lib/analytics';
 */
export {AnalyticsProvider, useAnalytics} from './provider';
export {track, screen, setUserProperties, reset, type AnalyticsEvent} from './events';
export {setEnabled, flush} from './client';
