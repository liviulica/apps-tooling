/**
 * Developer plan override (APP-OWNED FILE — not overwritten on blueprint
 * re-sync), so gated features can be exercised as Free, monthly, annual or
 * lifetime without a sandbox purchase.
 *
 * This fakes a paid entitlement, so read the safety design before extending it:
 *
 *  - **Reachable only from the developer console**, whose ROUTES are
 *    registered when `isDeveloper || __DEV__` (App.tsx). Precisely: dev
 *    builds, plus accounts whose Supabase profile carries the developer
 *    flag — the owner's release-build door, ON PURPOSE. For everyone else
 *    nothing can call the setter, `planOverride()` stays null, and
 *    `applyPlanOverride` returns its input untouched. This is an
 *    account-flag boundary, not a build-channel one (Codex made the
 *    distinction explicit); a fake here also only ever unlocks the
 *    flag-holder's own device, and relaunch clears it.
 *  - **It is memory only, never persisted.** A relaunch is always the truth.
 *    That deliberately gives up testing cold-start gating (the fail-closed
 *    window is covered by unit tests instead) in exchange for making "I forgot
 *    it was on" and "it shipped enabled" impossible rather than unlikely.
 *  - **It is never a purchase.** It rewrites the CONTEXT the UI reads. The SDK
 *    is untouched, `isMonetizationConfigured()` still reports the truth, and
 *    PaywallSheet still fetches real packages through client.ts, so an
 *    unconfigured build with an override still shows the sheet's honest
 *    "plans unavailable" state rather than a purchasable fiction.
 *
 * The override also forces `available` true. Without that, an unconfigured
 * build resolves every gate OPEN and "Free" would lock nothing, which is the
 * one thing the switcher exists to show.
 */

/** Free is a real choice here: it is how you check that gates actually bite. */
export type DevPlan = 'free' | 'monthly' | 'annual' | 'lifetime';

export interface DevPlanOption {
  plan: DevPlan;
  label: string;
  /** What the reader would be, in the app's own words. */
  detail: string;
}

export const DEV_PLAN_OPTIONS: DevPlanOption[] = [
  {plan: 'free', label: 'Free', detail: 'No entitlement, so every gate is locked'},
  {plan: 'monthly', label: 'Plus, monthly', detail: 'Active, renews in 30 days'},
  {plan: 'annual', label: 'Plus, yearly', detail: 'Active, renews in a year'},
  {plan: 'lifetime', label: 'Plus, lifetime', detail: 'Active, no expiry'},
];

const DAY_MS = 86_400_000;

let current: DevPlan | null = null;
const listeners = new Set<() => void>();

/** The override in force, or null when the real store answer is being used. */
export function planOverride(): DevPlan | null {
  return current;
}

/** Set or clear the override. `null` hands control back to the real store. */
export function setPlanOverride(plan: DevPlan | null): void {
  current = plan;
  if (plan) {
    // Loud on purpose: every entitlement answer in the app is now a fake, and
    // a silent fake is how someone spends an afternoon debugging a gate that
    // was never broken.
    console.warn(
      `[dev] Plus entitlement is FAKED as "${plan}". Gates and Profile are ` +
        'reading an override, not the store. It clears on relaunch.',
    );
  } else {
    console.warn('[dev] Plus entitlement override cleared, back to the store answer.');
  }
  for (const fn of listeners) {
    fn();
  }
}

export function subscribePlanOverride(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** The entitlement shape a given plan should present as. */
export function overriddenEntitlement(plan: DevPlan, now: number = Date.now()): {
  available: true;
  isPlus: boolean;
  expiresAt: string | null;
} {
  switch (plan) {
    case 'monthly':
      return {available: true, isPlus: true, expiresAt: new Date(now + 30 * DAY_MS).toISOString()};
    case 'annual':
      return {available: true, isPlus: true, expiresAt: new Date(now + 365 * DAY_MS).toISOString()};
    case 'lifetime':
      // Lifetime is a non-consumable: no expiry, and resolveEntitlement treats
      // a null expiry as "does not lapse".
      return {available: true, isPlus: true, expiresAt: null};
    case 'free':
    default:
      return {available: true, isPlus: false, expiresAt: null};
  }
}

/**
 * Apply an override to whatever the provider computed. Returns the SAME object
 * when `plan` is null, so the common path allocates nothing and a store build is
 * unaffected.
 *
 * `plan` is passed in rather than read from this module's state on purpose: the
 * provider holds it in React state so a switch re-renders, and a function that
 * secretly read module state would give that provider a dependency its memo
 * could not declare honestly.
 */
export function applyPlanOverride<T extends {available: boolean; isPlus: boolean; expiresAt: string | null}>(
  api: T,
  plan: DevPlan | null,
  now?: number,
): T {
  if (!plan) {
    return api;
  }
  return {...api, ...overriddenEntitlement(plan, now)};
}

/** Test-only reset. */
export function _resetForTests(): void {
  current = null;
  listeners.clear();
}
