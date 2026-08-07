/**
 * RevenueCat client wrapper (CORE FILE — overwritten on blueprint re-sync).
 *
 * This is the ONLY file that imports react-native-purchases. App code speaks
 * the SDK-free types in types.ts; to swap providers, this is the single file
 * you rewrite (same contract as lib/analytics/client.ts).
 *
 * Every function is safe to call when no API key is set: monetization simply
 * stays unconfigured and callers get UNCONFIGURED_STATE / empty packages.
 */
import Purchases, {LOG_LEVEL, type PurchasesPackage} from 'react-native-purchases';
import {REVENUECAT_API_KEY} from './config';
import {mapPackages, toEntitlementState} from './packages';
import {
  UNCONFIGURED_STATE,
  type EntitlementState,
  type PlusPackage,
  type PurchaseOutcome,
  type RestoreOutcome,
} from './types';

let initialized = false;
/** Raw packages by identifier, kept so purchase() can hand the SDK its own object back. */
const rawPackages = new Map<string, PurchasesPackage>();

export function isMonetizationConfigured(): boolean {
  return initialized;
}

export function init(): void {
  if (initialized) {
    return;
  }
  if (!REVENUECAT_API_KEY) {
    if (__DEV__) {
      console.warn(
        '[monetization] EXPO_PUBLIC_REVENUECAT_*_KEY is not set — monetization is disabled and all feature gates are open.',
      );
    }
    return;
  }
  // No appUserID: signed-out users purchase under a RevenueCat anonymous id;
  // the provider aliases it to the account id via identify() on sign-in.
  Purchases.configure({apiKey: REVENUECAT_API_KEY});
  void Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.WARN);
  initialized = true;
}

export async function getEntitlementState(): Promise<EntitlementState> {
  if (!initialized) {
    return UNCONFIGURED_STATE;
  }
  try {
    const info = await Purchases.getCustomerInfo();
    return toEntitlementState(info);
  } catch {
    // First-ever launch offline with no cache: closed but non-crashing.
    return {isPlus: false, expiresAt: null, configured: true};
  }
}

export async function getPlusPackages(): Promise<PlusPackage[]> {
  if (!initialized) {
    return [];
  }
  try {
    const offerings = await Purchases.getOfferings();
    const available = offerings.current?.availablePackages ?? [];
    rawPackages.clear();
    for (const pkg of available) {
      rawPackages.set(pkg.identifier, pkg);
    }
    return mapPackages(available);
  } catch {
    return [];
  }
}

export async function purchase(packageIdentifier: string): Promise<PurchaseOutcome> {
  if (!initialized) {
    return {status: 'error', message: 'Monetization is not configured.'};
  }
  let raw = rawPackages.get(packageIdentifier);
  if (!raw) {
    await getPlusPackages();
    raw = rawPackages.get(packageIdentifier);
  }
  if (!raw) {
    return {status: 'error', message: 'This option is unavailable right now.'};
  }
  try {
    const result = await Purchases.purchasePackage(raw);
    return {status: 'purchased', state: toEntitlementState(result.customerInfo)};
  } catch (e) {
    const err = e as {userCancelled?: boolean | null; message?: string};
    if (err.userCancelled) {
      return {status: 'cancelled'};
    }
    return {
      status: 'error',
      message: err.message ?? 'The purchase could not be completed.',
    };
  }
}

export async function restore(): Promise<RestoreOutcome> {
  if (!initialized) {
    return {status: 'error', message: 'Monetization is not configured.'};
  }
  try {
    const info = await Purchases.restorePurchases();
    const state = toEntitlementState(info);
    return {status: 'restored', state, found: state.isPlus};
  } catch (e) {
    const err = e as {message?: string};
    return {status: 'error', message: err.message ?? 'Restore failed.'};
  }
}

/** Alias the current (possibly anonymous) customer to the account user id. */
export async function identify(appUserId: string): Promise<void> {
  if (!initialized) {
    return;
  }
  try {
    await Purchases.logIn(appUserId);
  } catch {
    // Non-fatal: entitlements still resolve via the store account / restore.
  }
}

/** Back to a fresh anonymous customer (on sign-out). */
export async function resetIdentity(): Promise<void> {
  if (!initialized) {
    return;
  }
  try {
    // logOut() rejects when already anonymous; guard instead of catching blind.
    if (!(await Purchases.isAnonymous())) {
      await Purchases.logOut();
    }
  } catch {
    // Non-fatal.
  }
}

/** Entitlement change stream (renewals, restores on other devices, refunds). */
export function subscribe(listener: (state: EntitlementState) => void): () => void {
  if (!initialized) {
    return () => {};
  }
  const sdkListener = (info: Parameters<Parameters<typeof Purchases.addCustomerInfoUpdateListener>[0]>[0]) => {
    listener(toEntitlementState(info));
  };
  Purchases.addCustomerInfoUpdateListener(sdkListener);
  return () => {
    Purchases.removeCustomerInfoUpdateListener(sdkListener);
  };
}
