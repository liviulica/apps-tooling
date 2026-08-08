/**
 * RevenueCat's own paywall UI (react-native-purchases-ui) — the remotely
 * configured paywall built in the RevenueCat dashboard's editor, presented as
 * a native full-screen sheet. Used at the END of onboarding (owner call,
 * 2026-08-07): the one placement where the dashboard-editable paywall beats
 * our in-app PaywallSheet, because its content can be iterated without an app
 * release.
 *
 * Same rules as every native SDK here:
 *  - lazily required (a static import crashes binaries built before the
 *    module existed);
 *  - ship-dark: unconfigured monetization, a missing module, no offering, or
 *    ANY error all resolve to 'skipped' and onboarding continues as if the
 *    step did not exist. Onboarding must never hang or die on a paywall.
 */
import {track} from '../analytics';
import {isMonetizationConfigured} from './client';
import {PLUS_ENTITLEMENT} from './types';

type PaywallUiSdk = typeof import('react-native-purchases-ui');

let sdk: PaywallUiSdk | null | undefined;
function getSdk(): PaywallUiSdk | null {
  if (sdk === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      sdk = require('react-native-purchases-ui') as PaywallUiSdk;
    } catch {
      sdk = null;
    }
  }
  return sdk;
}

export type OnboardingPaywallResult = 'purchased' | 'restored' | 'dismissed' | 'skipped';

/**
 * Present the dashboard-configured paywall once, at onboarding's end. The
 * caller always proceeds afterwards; the result feeds analytics only — the
 * entitlement itself updates through the provider's customer-info listener,
 * not through this return value.
 */
export async function presentOnboardingPaywall(): Promise<OnboardingPaywallResult> {
  if (!isMonetizationConfigured()) {
    return 'skipped';
  }
  const mod = getSdk();
  if (!mod) {
    return 'skipped';
  }
  try {
    track('Paywall Viewed', {trigger: 'onboarding', surface: 'revenuecat'});
    // presentPaywallIfNeeded: an already-entitled reader (restored device,
    // family plan) is never shown a sales screen for what they own.
    // The race is the Codex-caught hang guard: the SDK gives no signal if its
    // native promise simply never settles, and onboarding must not die on a
    // paywall. 45s is long enough for any real purchase flow to have STARTED
    // (store sheets keep working even if we proceed underneath) and short
    // enough that a wedged bridge does not brick first run.
    const result = await Promise.race([
      mod.default.presentPaywallIfNeeded({
        requiredEntitlementIdentifier: PLUS_ENTITLEMENT,
        displayCloseButton: true,
      }),
      new Promise<null>(resolve => setTimeout(() => resolve(null), 45_000)),
    ]);
    if (result === null) {
      return 'skipped';
    }
    switch (result) {
      case mod.PAYWALL_RESULT.PURCHASED:
        track('Purchase Completed', {trigger: 'onboarding', surface: 'revenuecat'});
        return 'purchased';
      case mod.PAYWALL_RESULT.RESTORED:
        track('Purchases Restored', {trigger: 'onboarding', surface: 'revenuecat'});
        return 'restored';
      case mod.PAYWALL_RESULT.CANCELLED:
        track('Paywall Dismissed', {trigger: 'onboarding', surface: 'revenuecat'});
        return 'dismissed';
      // NOT_PRESENTED (no offering / no paywall configured) and ERROR both
      // mean the reader saw nothing; the Viewed event above overcounts by one
      // in that case, which the result property on Dismissed cannot fix —
      // accepted, because the SDK gives no pre-flight "would present" check.
      default:
        return 'skipped';
    }
  } catch {
    return 'skipped';
  }
}
