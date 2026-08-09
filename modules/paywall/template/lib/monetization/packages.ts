/**
 * Pure mapping from SDK shapes to app types (CORE FILE — overwritten on
 * blueprint re-sync).
 *
 * Structurally typed so tests exercise them without the native SDK. Only
 * client.ts feeds these real react-native-purchases objects.
 */
import type {EntitlementState, PlusPackage, PlusPackageType} from './types';
import {PLUS_ENTITLEMENT} from './types';
import {resolveEntitlement} from './entitlements';

/** The subset of PurchasesPackage that display and purchase need. */
export type PackageLike = {
  identifier: string;
  packageType: string;
  product: {
    /** STORE product id (db_scholar_annual), the key eligibility answers use. */
    identifier: string;
    priceString: string;
    price: number;
    /** The store's introductory offer; price 0 is a free trial. */
    introPrice?: {
      price: number;
      periodUnit: string;
      periodNumberOfUnits: number;
      /** Billing periods the offer spans; 2 cycles of 1 week = 2 weeks. */
      cycles?: number;
    } | null;
  };
};

/** The subset of CustomerInfo that entitlement resolution needs. */
export type CustomerInfoLike = {
  entitlements: {
    active: Record<string, {isActive: boolean; expirationDate: string | null}>;
  };
};

const PACKAGE_TYPE_MAP: Record<string, PlusPackageType> = {
  MONTHLY: 'monthly',
  ANNUAL: 'annual',
  LIFETIME: 'lifetime',
};

const PERIOD_LABELS: Record<PlusPackageType, string> = {
  monthly: 'per month',
  annual: 'per year',
  lifetime: 'once, forever',
};

const DISPLAY_ORDER: PlusPackageType[] = ['annual', 'monthly', 'lifetime'];

/** Duration words per store period unit, singular form. */
const PERIOD_UNIT_WORDS: Record<string, string> = {
  DAY: 'day',
  WEEK: 'week',
  MONTH: 'month',
  YEAR: 'year',
};

/**
 * "1 week" / "3 days" from the store's introductory-offer period, or null for
 * a unit this module does not recognize (better no trial line than a wrong
 * one). A DURATION is composed here — never a price; prices only ever pass
 * through as the store's own strings.
 */
export function trialLength(periodUnit: string, units: number): string | null {
  const word = PERIOD_UNIT_WORDS[periodUnit];
  if (!word || units < 1) {
    return null;
  }
  return `${units} ${word}${units === 1 ? '' : 's'}`;
}

/**
 * Keep only the package types this app sells, in display order (annual
 * first: it is the preselected recommendation). Unknown package types are
 * dropped rather than guessed at.
 *
 * `trialEligibleProductIds` is the READER's trial eligibility, by store
 * product id. The store product carries its intro offer for everyone, but on
 * iOS eligibility is per account: a reader who already used the trial in this
 * subscription group would be promised "1 week free" and then charged the
 * full price on the very next sheet (the Codex blocker on the paywall
 * switch). When a set is provided, only products in it keep their trial;
 * `null` means "the store already curated offers for this account" (Google
 * Play), so the offer's presence IS eligibility.
 */
export function mapPackages(
  packages: PackageLike[],
  trialEligibleProductIds: ReadonlySet<string> | null = null,
): PlusPackage[] {
  const mapped: PlusPackage[] = [];
  for (const pkg of packages) {
    const packageType = PACKAGE_TYPE_MAP[pkg.packageType];
    if (!packageType) {
      continue;
    }
    const intro = pkg.product.introPrice;
    // Only a FREE introductory offer the reader is actually ELIGIBLE for
    // becomes a trial; a paid intro price maps to nothing (types.ts doc).
    const freeIntro = intro != null && intro.price === 0;
    const eligible =
      trialEligibleProductIds == null || trialEligibleProductIds.has(pkg.product.identifier);
    mapped.push({
      identifier: pkg.identifier,
      packageType,
      priceString: pkg.product.priceString,
      periodLabel: PERIOD_LABELS[packageType],
      price: pkg.product.price,
      trial:
        freeIntro && eligible
          ? // The offer spans cycles × period (2 cycles of 1 week = 2 weeks);
            // stating one cycle understates the store's own terms.
            trialLength(intro.periodUnit, intro.periodNumberOfUnits * Math.max(1, intro.cycles ?? 1))
          : null,
    });
  }
  return mapped.sort(
    (a, b) => DISPLAY_ORDER.indexOf(a.packageType) - DISPLAY_ORDER.indexOf(b.packageType),
  );
}

/**
 * What the annual plan saves against paying monthly for a year, as a whole
 * percent — or null when either price is missing or the math would not
 * genuinely favor annual. A PERCENTAGE is not a price: this is the one piece
 * of price arithmetic the display layer is allowed, because a rounding error
 * here misstates a discount claim, not what the reader will be charged.
 */
export function annualSavingsPercent(packages: PlusPackage[]): number | null {
  const annual = packages.find(p => p.packageType === 'annual');
  const monthly = packages.find(p => p.packageType === 'monthly');
  if (!annual || !monthly || annual.price <= 0 || monthly.price <= 0) {
    return null;
  }
  const pct = Math.round((1 - annual.price / (monthly.price * 12)) * 100);
  return pct >= 5 ? pct : null;
}

/** Normalize CustomerInfo into the app's EntitlementState. */
export function toEntitlementState(info: CustomerInfoLike): EntitlementState {
  const plus = info.entitlements.active[PLUS_ENTITLEMENT];
  return resolveEntitlement({
    active: plus?.isActive === true,
    expiresAt: plus?.expirationDate ?? null,
  });
}
