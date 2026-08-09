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
import {Platform} from 'react-native';
import type {CustomerInfo, PurchasesPackage} from 'react-native-purchases';
import {REVENUECAT_API_KEY} from './config';
import {mapPackages, toEntitlementState} from './packages';
import {
  UNCONFIGURED_STATE,
  type EntitlementState,
  type PlusPackage,
  type PurchaseOutcome,
  type RestoreOutcome,
} from './types';

/**
 * The SDK, loaded LAZILY and defensively (the translate.ts lesson, fourth
 * use): react-native-purchases resolves its native module at import time, and
 * a binary built before it existed — every install of an older build — would
 * crash AT APP START on a static import. A missing module reads as
 * "monetization unavailable", which ship-dark already handles.
 */
type PurchasesSdk = typeof import('react-native-purchases');
let sdkModule: PurchasesSdk | null | undefined;
function getSdk(): PurchasesSdk | null {
  if (sdkModule === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      sdkModule = require('react-native-purchases') as PurchasesSdk;
    } catch {
      sdkModule = null;
    }
  }
  return sdkModule;
}
/** Non-null exactly while `initialized` is true; set once in init(). */
let Purchases: PurchasesSdk['default'] | null = null;

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
  const sdk = getSdk();
  if (!sdk) {
    return;
  }
  Purchases = sdk.default;
  try {
    // No appUserID: signed-out users purchase under a RevenueCat anonymous id;
    // the provider aliases it to the account id via identify() on sign-in.
    Purchases.configure({apiKey: REVENUECAT_API_KEY});
    void Purchases.setLogLevel(__DEV__ ? sdk.LOG_LEVEL.DEBUG : sdk.LOG_LEVEL.WARN);
    initialized = true;
  } catch {
    // A malformed key or a native initialization fault must read as
    // "monetization unavailable", never take the provider tree down.
    Purchases = null;
  }
}

export async function getEntitlementState(): Promise<EntitlementState> {
  if (!initialized || !Purchases) {
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
  if (!initialized || !Purchases) {
    return [];
  }
  try {
    const offerings = await Purchases.getOfferings();
    const available = offerings.current?.availablePackages ?? [];
    rawPackages.clear();
    for (const pkg of available) {
      rawPackages.set(pkg.identifier, pkg);
    }
    return mapPackages(available, await trialEligibility(available));
  } catch {
    return [];
  }
}

/**
 * Which of these products' free trials THIS store account may actually start.
 *
 * A product carries its introductory offer for everyone, but on iOS
 * eligibility is per account (one trial per subscription group), so showing
 * the offer to an ineligible reader promises "1 week free" and charges the
 * full price on Apple's very next sheet — a billing-promise mismatch and an
 * App Review 3.1.2 risk. The SDK's own guidance for UNKNOWN is to display
 * the non-intro pricing, so anything not positively ELIGIBLE is left out,
 * and an eligibility-check failure hides trials rather than promising one.
 *
 * Android returns null: Google curates offers per account before they reach
 * the SDK (and this API always answers UNKNOWN there), so on Play the
 * offer's presence is itself the eligibility answer.
 */
async function trialEligibility(
  available: PurchasesPackage[],
): Promise<ReadonlySet<string> | null> {
  if (Platform.OS !== 'ios') {
    return null;
  }
  const eligible = new Set<string>();
  const candidates = available
    .filter(pkg => pkg.product.introPrice?.price === 0)
    .map(pkg => pkg.product.identifier);
  if (candidates.length === 0 || !Purchases) {
    return eligible;
  }
  try {
    const sdk = getSdk();
    const answers = await Purchases.checkTrialOrIntroductoryPriceEligibility(candidates);
    for (const [productId, answer] of Object.entries(answers)) {
      if (
        sdk != null &&
        answer.status === sdk.INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE
      ) {
        eligible.add(productId);
      }
    }
  } catch {
    // Fall through with whatever was confirmed (nothing): no trial promised.
  }
  return eligible;
}

export async function purchase(packageIdentifier: string): Promise<PurchaseOutcome> {
  if (!initialized || !Purchases) {
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
  if (!initialized || !Purchases) {
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
  if (!initialized || !Purchases) {
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
  if (!initialized || !Purchases) {
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
  const sdk = Purchases;
  if (!initialized || !sdk) {
    return () => {};
  }
  const sdkListener = (info: CustomerInfo) => {
    listener(toEntitlementState(info));
  };
  sdk.addCustomerInfoUpdateListener(sdkListener);
  return () => {
    sdk.removeCustomerInfoUpdateListener(sdkListener);
  };
}
