/**
 * Monetization types (CORE FILE — overwritten on blueprint re-sync).
 *
 * Deliberately SDK-free: everything the app (provider, paywall UI, gates)
 * consumes is expressed in these types. Only client.ts maps them to and from
 * react-native-purchases, so the SDK can be swapped or stay uninstalled
 * (tests, unconfigured builds) without touching app code.
 */

/** The single entitlement this app sells. */
export const PLUS_ENTITLEMENT = 'plus';

export type PlusPackageType = 'monthly' | 'annual' | 'lifetime';

/** A purchasable package, already mapped from the store offering. */
export type PlusPackage = {
  /** RevenueCat package identifier (stable key for purchase calls). */
  identifier: string;
  packageType: PlusPackageType;
  /** Store-localized price string, e.g. "€2,99". Never compose prices. */
  priceString: string;
  /** Localized per-period suffix for display, e.g. "per month". */
  periodLabel: string;
};

/** Normalized entitlement snapshot derived from CustomerInfo. */
export type EntitlementState = {
  /** True when the plus entitlement is currently active. */
  isPlus: boolean;
  /** ISO date when the entitlement lapses; null for lifetime/none. */
  expiresAt: string | null;
  /** True when the SDK is configured and this state is authoritative. */
  configured: boolean;
};

export type PurchaseOutcome =
  | {status: 'purchased'; state: EntitlementState}
  | {status: 'cancelled'}
  | {status: 'error'; message: string};

export type RestoreOutcome =
  | {status: 'restored'; state: EntitlementState; found: boolean}
  | {status: 'error'; message: string};

/** Entitlement state when monetization is not configured: nothing is sold, nothing is locked. */
export const UNCONFIGURED_STATE: EntitlementState = {
  isPlus: false,
  expiresAt: null,
  configured: false,
};
