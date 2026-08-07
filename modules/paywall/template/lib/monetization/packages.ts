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
  product: {priceString: string};
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

/**
 * Keep only the package types this app sells, in display order (annual
 * first: it is the preselected recommendation). Unknown package types are
 * dropped rather than guessed at.
 */
export function mapPackages(packages: PackageLike[]): PlusPackage[] {
  const mapped: PlusPackage[] = [];
  for (const pkg of packages) {
    const packageType = PACKAGE_TYPE_MAP[pkg.packageType];
    if (!packageType) {
      continue;
    }
    mapped.push({
      identifier: pkg.identifier,
      packageType,
      priceString: pkg.product.priceString,
      periodLabel: PERIOD_LABELS[packageType],
    });
  }
  return mapped.sort(
    (a, b) => DISPLAY_ORDER.indexOf(a.packageType) - DISPLAY_ORDER.indexOf(b.packageType),
  );
}

/** Normalize CustomerInfo into the app's EntitlementState. */
export function toEntitlementState(info: CustomerInfoLike): EntitlementState {
  const plus = info.entitlements.active[PLUS_ENTITLEMENT];
  return resolveEntitlement({
    active: plus?.isActive === true,
    expiresAt: plus?.expirationDate ?? null,
  });
}
