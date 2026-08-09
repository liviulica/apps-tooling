/**
 * Monetization public surface (CORE FILE — overwritten on blueprint re-sync).
 *
 * App code imports from here; only client.ts touches the store SDK.
 */
export {MonetizationProvider, usePlus, useFeatureGate} from './provider';
export {isFeatureUnlocked, resolveEntitlement} from './entitlements';
export {offerPlus} from './gate-paywall';
export {annualSavingsPercent} from './packages';
export {GATE_COPY, PAYWALL_FEATURE_ORDER} from './gates';
export type {PlusFeature, GateCopy} from './gates';
export type {
  EntitlementState,
  PlusPackage,
  PlusPackageType,
  PurchaseOutcome,
  RestoreOutcome,
} from './types';
export {PLUS_ENTITLEMENT} from './types';
