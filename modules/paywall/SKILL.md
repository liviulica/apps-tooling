---
name: setup-paywall
description: Add RevenueCat monetization (subscriptions + lifetime unlock, feature gates, custom paywall) to the current Expo/React Native app from the apps-tooling paywall blueprint. Use when the user wants to add payments, subscriptions, in-app purchases, a paywall, a premium/plus tier, or RevenueCat, or says "set up the paywall module" / "add monetization like daily-book has".
---

# setup-paywall

Vendors the paywall blueprint into the current app: an SDK-free monetization
core with ship-dark feature gates, RevenueCat confined to one file, and a
compliant custom paywall example. Create a todo per step and work through
them in order. `blueprint.json` in this module is the source of truth for
files, deps, env, and wiring; read `paywall-guidelines.md` before making any
gating decision.

## What this produces in the target app

- `lib/monetization/` (core files + app-owned `gates.ts`)
- `components/PaywallSheet.tsx` (app-owned; adapt to the design system)
- `react-native-purchases` installed and pod-installed
- Android BILLING permission; iOS In-App Purchase capability noted
- Monetization events in the app's analytics union (if analytics exists)
- The paywall authoring rule appended to CLAUDE.md/AGENTS.md
- Env keys scaffolded in `.env.example` (empty = the app ships dark)
- A `docs/monetization-setup-remaining.md` for the dashboard work

## Prerequisites to confirm with the user before starting

1. React Native >= 0.73 (the SDK's floor; verify in package.json).
2. Bare workflow or prebuild? (Both fine; no config plugin involved. Bare
   needs the Xcode capability added by hand later.)
3. Is the accounts module present? (Determines the appUserId wiring.)
4. What is being gated? Walk the user through the product contract in
   `paywall-guidelines.md` (never content, no claw-backs, no growth loops).
   If nothing gate-worthy exists yet, that is FINE: install ship-dark with
   an `upcoming` gate list.
5. One entitlement id (default `plus`) and the display name of the tier.

## Steps

1. **Locate the blueprint.** Resolve this module's directory (the skill may
   be symlinked); read `blueprint.json`.
2. **Confirm compatibility.** RN version, react version, new architecture.
   `react-native-purchases@^10.4.2`; 10.2.1 is the hard floor on RN 0.79+.
3. **Copy files** per `blueprint.files`, honoring ownership (`core`
   overwrite on re-sync; `app` write-once). Keep the import paths the app
   uses (adjust relative paths if the app's layout differs).
4. **Install** `react-native-purchases` and run `pod install` (use the
   app's Gemfile/bundler if it has one).
5. **Android manifest:** add `com.android.vending.BILLING`. Note the
   launchMode caveat from `blueprint.native.android.notes` in the setup doc.
6. **Wire the root** per `blueprint.wiring`: with accounts, add a bridge
   component inside `<AccountsProvider>` passing
   `appUserId={user?.id ?? null}`; without accounts, `appUserId={null}`.
7. **Define the gates.** Edit `lib/monetization/gates.ts` with the app's
   real gate keys and paywall copy (sentence case, the app's voice). Check
   each against the guidelines' product contract with the user.
8. **Adapt the paywall.** `components/PaywallSheet.tsx` is the DailyBook
   worked example: swap in the app's theme/fonts/haptics/analytics. Keep
   the compliance invariants (billed amount most prominent, auto-renew
   wording, restore, terms + privacy links, store price strings only).
9. **Analytics events** (if the analytics module is present): add the six
   monetization events to the app's typed union exactly as named in the
   authoring rule.
10. **Env scaffolding:** add both `EXPO_PUBLIC_REVENUECAT_*_KEY` entries to
    `.env.example` with the ship-dark comment; do NOT invent values.
11. **Append the governance rule** from `template/paywall-authoring-rule.md`
    to the app's CLAUDE.md/AGENTS.md between the BEGIN/END markers.
12. **Write `docs/monetization-setup-remaining.md`** for the app: RevenueCat
    project, ASC/Play products, In-App Purchase Key upload, sandbox
    checklist, first-IAP submission. Use daily-book's copy as the template.
13. **Verify** per `blueprint.verify`: tsc, unit tests for the pure logic
    (gate-open-when-unconfigured is the critical one), pod install, the
    single-SDK-importer grep, and a keyless build showing no paid UI.

## Notes

- Ship-dark is the contract: installing this module must not change the app
  for users. Turning monetization on later is dashboards + env keys, not
  code.
- Unit-test the pure files (entitlements, packages, gates) in the app's
  test runner; the client and UI are verified on-device in sandbox.
- The server entitlement mirror (webhook + entitlements table) is a later
  phase and lives with the accounts module's `revenuecat-webhook` stub; do
  not build it during setup.

## Presenting the paywall in onboarding (updated 2026-08-09)

Use the SAME `PaywallSheet`, at the end of the flow, after the final
preparation step and before the done-callback. There is no separate remote
surface to install: `react-native-purchases-ui` was adopted for one day and
retired (paywall-guidelines.md, "The remote paywall").

The rules the first-run case adds, all of which cost real debugging to find:

- Prefetch packages EARLY (while the user is on an earlier step) via
  `refreshPackages()`.
- Present only when there is a real offer: configured, not already entitled,
  and packages present. Anything else skips silently to the app.
- **A pending fetch is not an empty offering.** If the flow decides the instant
  the last step completes, a slow store silently skips the paywall. Wait for the
  in-flight fetch, with a short belt (4s) so a first run can never hang.
- Make completion IDEMPOTENT. Sheet libraries echo `onDismiss` after your own
  close handler, so an unguarded "dismiss finishes onboarding" runs twice and
  races two flag writes.
- Port the tests: mount the real flow and assert the skip cases (unconfigured,
  entitled, empty offering), the pending-fetch case, the belt, and single
  completion. A first run that can hang or double-complete is worse than no
  paywall.

## Free trials: ask the store about the CUSTOMER, not the product

`packages.ts` takes an eligibility set and `client.ts` fills it from
`checkTrialOrIntroductoryPriceEligibility`. Do not bypass it: a product carries
its intro offer for everyone, but iOS grants one trial per subscription group
per account, so a paywall built from the product alone promises a free week to
people the store then charges in full. UNKNOWN and errors mean "show plain
pricing". Android answers UNKNOWN always and curates offers per account, so pass
null there.
