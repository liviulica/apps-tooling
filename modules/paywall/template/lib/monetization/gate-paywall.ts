/**
 * The gate → paywall handoff (CORE FILE — overwritten on blueprint re-sync),
 * in one place so every gate call site behaves identically.
 *
 * Why this exists as a seam rather than a direct `setPaywallVisible(true)`:
 * the app tried RevenueCat's dashboard-configured paywall
 * (`react-native-purchases-ui`) as the surface at every trigger and retired it
 * after a day on device (paywall-guidelines.md, "The remote paywall"). While
 * that surface was live, this function awaited a native modal and answered
 * "the remote paywall showed nothing, present ours instead". Now it answers
 * true unconditionally, and the call sites did not change.
 *
 * Keep the Promise<boolean> shape. It costs one await at five call sites and it
 * is the whole reason swapping the surface back, or A/B-testing a remote one
 * against the local sheet, is a one-file change instead of a refactor.
 *
 * The caller renders <PaywallSheet visible trigger="..."> when this resolves
 * true. Callers must check the entitlement BEFORE calling: an already-paid
 * customer should never be offered a sales screen.
 */

export async function offerPlus(_trigger: string): Promise<boolean> {
  return true;
}
