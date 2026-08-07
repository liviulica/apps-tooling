/**
 * Entitlement resolution (CORE FILE — overwritten on blueprint re-sync).
 *
 * Pure logic, no SDK imports, fully unit-tested. The one product rule encoded
 * here: when monetization is NOT configured (no store keys in the build),
 * every gate is open. That makes the foundation safe to merge and ship dark;
 * nothing locks until keys are present, and flipping them on is a config
 * change, not a code change.
 */
import type {EntitlementState} from './types';
import type {PlusFeature} from './gates';

/**
 * Whether a gated feature is usable right now.
 *
 * - Unconfigured build: open (free apps stay whole; nothing is for sale yet).
 * - Configured: open only with an active plus entitlement.
 */
export function isFeatureUnlocked(
  state: EntitlementState,
  _feature: PlusFeature,
): boolean {
  if (!state.configured) {
    return true;
  }
  return state.isPlus;
}

/**
 * Normalize a raw entitlement snapshot (from the SDK's CustomerInfo) into
 * EntitlementState. `expiresAt` in the past means the store already lapsed
 * the entitlement; treat it as inactive even if the cached flag says active
 * (belt and braces for stale offline caches).
 */
export function resolveEntitlement(input: {
  active: boolean;
  expiresAt: string | null;
  now?: Date;
}): EntitlementState {
  const now = input.now ?? new Date();
  const lapsed =
    input.expiresAt !== null && new Date(input.expiresAt).getTime() <= now.getTime();
  return {
    isPlus: input.active && !lapsed,
    expiresAt: input.expiresAt,
    configured: true,
  };
}
