/**
 * Feature gates (APP-OWNED FILE — NOT overwritten on blueprint re-sync).
 *
 * The single source of truth for what your paid tier gates. Rules
 * (modules/paywall/paywall-guidelines.md): gate tools, never content; never
 * claw back a feature that shipped free to public users; never gate growth
 * loops (sharing, referrals, onboarding). Add a gate here in the same change
 * that builds the feature, with its paywall copy.
 *
 * Replace the example below with your app's gates. Keys are kebab-case and
 * stable (they end up in analytics `trigger` props).
 */

/** Every gated capability in this app. Content is not representable here. */
export type PlusFeature =
  /** EXAMPLE: cloud backup of user-imported files (server cost = honest gate). */
  | 'import-cloud-backup';

export type GateCopy = {
  /** One-line benefit shown on the paywall feature list. Sentence case. */
  benefit: string;
  /** Icon name for the feature row (whatever icon set the app uses). */
  icon: string;
  /** True while the feature itself has not shipped ("coming soon"). */
  upcoming?: boolean;
};

export const GATE_COPY: Record<PlusFeature, GateCopy> = {
  'import-cloud-backup': {
    benefit: 'Your imports, backed up and on every device',
    icon: 'cloud-upload-outline',
    upcoming: true,
  },
};

/** Gates listed on the paywall, shipped features first. */
export const PAYWALL_FEATURE_ORDER: PlusFeature[] = ['import-cloud-backup'];
