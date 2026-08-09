# paywall (RevenueCat)

Subscriptions + lifetime unlock for Expo/React Native apps: one entitlement,
feature gates, and a compliant custom paywall, with the store SDK
(react-native-purchases) confined to a single swappable file. Built against
DailyBook first (branch `feat/monetization-foundation`; rationale in
`daily-book/docs/monetization-research.md`), then generalized.

The product rules (what may be gated, store compliance, analytics taxonomy)
live in [paywall-guidelines.md](paywall-guidelines.md); read that before
deciding anything. This README is the code contract.

## Why a wrapper

Same reasoning as analytics/accounts: app code never touches the provider
SDK. `client.ts` is the only file importing `react-native-purchases`;
everything else (provider, gates, paywall UI, tests) speaks the SDK-free
types in `types.ts`. Swapping to Adapty or raw StoreKit later is a one-file
rewrite. And the pure logic (entitlement resolution, package mapping) stays
unit-testable without native modules.

**Ship-dark safety, the load-bearing property:** with no
`EXPO_PUBLIC_REVENUECAT_*_KEY` in the build, monetization is off, no paid UI
renders, and **every feature gate resolves open**. Vendoring this module
changes nothing for users; turning it on is a config change.

## Install into an app

Preferred: symlink this module as a skill and run it (`setup-paywall`), per
the root README. Manual path: follow `SKILL.md` step by step;
`blueprint.json` is the source of truth for files, deps, env, and wiring.

## Files and ownership

| File | Ownership | Role |
|---|---|---|
| `template/lib/monetization/types.ts` | core | SDK-free types (`PlusPackage`, `EntitlementState`, outcomes) |
| `template/lib/monetization/config.ts` | core | Env keys per platform; empty = ship dark |
| `template/lib/monetization/client.ts` | core | The ONLY react-native-purchases importer; all no-op safe |
| `template/lib/monetization/entitlements.ts` | core | Pure gate resolution (unconfigured = open) |
| `template/lib/monetization/packages.ts` | core | Pure SDK-shape → app-type mapping |
| `template/lib/monetization/provider.tsx` | core | `MonetizationProvider` + `usePlus` + `useFeatureGate` |
| `template/lib/monetization/index.ts` | core | Public surface |
| `template/lib/monetization/gates.ts` | app | THE file you edit: gate keys + paywall copy |
| `template/components/PaywallSheet.tsx` | app | Worked-example paywall (DailyBook); adapt to the app's design system |
| `template/paywall-authoring-rule.md` | append | Governance block for the app's CLAUDE.md |

## The entitlement contract

- One entitlement (default id `plus`, `types.ts`), any number of products
  attached to it in the RevenueCat dashboard (monthly, annual, lifetime).
- `useFeatureGate('<key>')` at every feature boundary; keys live in
  app-owned `gates.ts` with their paywall copy.
- Identity: anonymous by default; `<MonetizationProvider appUserId={...}>`
  bridges the app's auth (pass the backend user UUID or null). Works with
  or without the accounts module.
- Entitlement state stays OUT of the accounts sync registry; RevenueCat is
  already the cross-device truth.

## Gotchas (hard-won, from the July 2026 research)

- **Lifetime products must be non-consumable in the RevenueCat dashboard.**
  Since SDK 10, a one-time product marked consumable gets consumed and
  cannot be restored: fatal for signed-out buyers.
- **Upload the App Store Connect In-App Purchase Key to RevenueCat during
  setup.** StoreKit 2 (the default) records no transactions without it.
- `getOfferings()` returning empty products almost always means the Paid
  Applications agreement/banking/tax is not Active in ASC, not a bug.
- The first IAP can only be reviewed attached to an app version.
- react-native-purchases ≥ 10.2.1 required on RN 0.79+ (NativeEventEmitter
  crash before that); pinned `^10.7.0` in the blueprint. Do NOT add
  `react-native-purchases-ui`: it was adopted at every trigger for one day and
  retired the next (paywall-guidelines.md, "The remote paywall"). Its editor
  could not reliably express selection state or a light palette, a light-mode
  device rendered the dark one, and the native sheet follows SYSTEM appearance
  while apps with more than two themes need their own.
- Free trials are gated on ELIGIBILITY, not on the product carrying an intro
  offer. iOS grants one trial per subscription group per account; promising one
  to an ineligible customer is a billing-promise mismatch (3.1.2).
- Android: `com.android.vending.BILLING` permission; verify the purchase
  flow under the app's `launchMode` in sandbox (`singleTask` can cancel
  purchases mid-flow; only change it after confirming, since it affects
  deep links).
- Sandbox: physical device + ASC sandbox tester on iOS (simulator needs a
  StoreKit config file + certificate upload); Play needs a closed-track
  upload, a license tester, AND the tester opt-in URL opened.

## Dev harness (this repo)

`npm test` runs `tests/paywall.test.ts` (vitest) against the pure template
files; `npm run typecheck` includes them. UI and client are exercised in the
target app (jest there, plus on-device sandbox purchases).
