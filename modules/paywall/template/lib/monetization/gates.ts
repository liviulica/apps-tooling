/**
 * Feature gates (APP-OWNED FILE — NOT overwritten on blueprint re-sync).
 *
 * The single source of truth for what the paid tier gates. Rules
 * (apps-tooling modules/paywall/paywall-guidelines.md): gate tools, never
 * content; never claw back a feature that shipped free to public users;
 * never gate growth loops (sharing, onboarding). Add a gate here in the same
 * change that builds the feature, with its paywall copy.
 *
 * The keys below are the EXAMPLE set from the app this module was built
 * against (a reading app). Replace them with yours; keep the shape, which is
 * one key per capability with the paywall copy beside it, so the paywall can
 * never advertise a gate that does not exist and a gate can never exist
 * without copy.
 *
 * Whatever the app's content is, it has no key here on purpose.
 */

/** Every Plus-gated capability. Content is not representable here. */
export type PlusFeature =
  /** Read-along for imported book + audio pairs (on-device alignment). */
  | 'imported-alignment'
  /** More than one translation target language (first one is free). */
  | 'translation-multi'
  /** Notebook exports (Obsidian / Notion / Anki files). Saving stays free. */
  | 'notebook-export'
  /** Imported library backup + cross-device sync (future). */
  | 'import-cloud-backup'
  /** Alternate app icons (future). */
  | 'custom-app-icon'
  /** Themes beyond the six that shipped free (future). */
  | 'premium-themes';

export type GateCopy = {
  /** One-line benefit shown on the paywall feature list. Sentence case. */
  benefit: string;
  /** Ionicons name for the feature row. */
  icon: string;
  /** True while the feature itself has not shipped ("coming to Plus"). */
  upcoming?: boolean;
};

export const GATE_COPY: Record<PlusFeature, GateCopy> = {
  'imported-alignment': {
    benefit: 'Read along with your own books and audiobooks',
    icon: 'sparkles-outline',
  },
  'translation-multi': {
    benefit: 'Translate into all your languages, not just one',
    icon: 'language-outline',
  },
  'notebook-export': {
    benefit: 'Send your notebook to Obsidian, Notion or Anki',
    icon: 'share-outline',
  },
  'import-cloud-backup': {
    benefit: 'Your imported library, backed up and on every device',
    icon: 'cloud-upload-outline',
    upcoming: true,
  },
  'custom-app-icon': {
    benefit: 'A bookshelf of app icons to choose from',
    icon: 'apps-outline',
    upcoming: true,
  },
  'premium-themes': {
    benefit: 'New reading themes as they are bound',
    icon: 'color-palette-outline',
    upcoming: true,
  },
};

/** Gates listed on the paywall, shipped features first. */
export const PAYWALL_FEATURE_ORDER: PlusFeature[] = [
  'imported-alignment',
  'translation-multi',
  'notebook-export',
  'import-cloud-backup',
  'custom-app-icon',
  'premium-themes',
];

/**
 * EXAMPLE of a gate predicate, kept because its bug is instructive.
 *
 * This one answers "did the user bring this content themselves", which is what
 * decides whether the imported-alignment gate applies. It first matched only
 * one of the two id shapes the app actually mints for user content, so a pair
 * built from one of each slipped through ungated. If a gate depends on WHICH
 * object it is looking at, write the predicate once, here, and make every call
 * site go through it — then a missed shape is one fix, not a hunt.
 */
export function isImportedContentId(id: string | null | undefined): boolean {
  return !!id && (id.startsWith('import-') || id.startsWith('local-audio-'));
}
