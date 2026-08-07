# Paywall guidelines

The single source of truth for monetization decisions in apps built from this
toolkit. Read it before gating anything, pricing anything, or touching a
paywall. The vendored code contract lives in the module README; this doc is
the rules. Verified against primary sources July 2026.

## The product contract (non-negotiable)

1. **Content is never paywalled.** The paid tier sells tools, comfort, and
   capacity. Whatever the app exists to deliver (books, recipes, workouts)
   stays free. There is deliberately no way to express a content gate in
   `gates.ts`.
2. **The free app stays a complete product.** A new user who never pays gets
   a whole, respectful experience, not a demo.
3. **No claw-backs.** A feature that shipped free to public users is not
   moved behind the paywall later. The only exception: a feature merged but
   never included in any store build, taken as an explicit, documented
   decision (record it in the app's design docs).
4. **Growth loops are never gated.** Sharing, referrals, invitations,
   onboarding. A share that hits a paywall stops being a share.
5. **The paid tier never requires an account.** Purchases work signed-out
   (RevenueCat anonymous ids) and merge into the account on sign-in.
   Account-shaped features (cloud sync) naturally need one; the entitlement
   itself does not.
6. **Store rules, not side doors.** Digital unlocks go through Apple/Google
   IAP. External processors (Stripe/Revolut checkout inside the app) are
   prohibited outside the EU, and US link-outs are legally in flux
   (post-Epic; commission remand pending). For a small developer the Small
   Business Program (15%) plus one-tap conversion beats becoming merchant of
   record. Revisit only at real scale.

## The three building blocks (RevenueCat)

| Thing | What it is | Where it lives |
|---|---|---|
| Product | A store SKU (`db_plus_monthly`) | App Store Connect / Play Console |
| Entitlement | The access level a customer holds (`plus`) | RevenueCat dashboard, checked in code |
| Offering / package | What the paywall currently presents (`default`: `$rc_monthly`, `$rc_annual`, `$rc_lifetime`) | RevenueCat dashboard, fetched at runtime |

Code checks ONE entitlement; dashboards decide which products grant it. The
paywall renders whatever the current offering returns, so repricing and
repackaging never need an app update.

## Deciding what to gate

Good gates have at least one of: real marginal cost you pay per user (server
storage, API calls), power-user depth (most users never miss it), or pure
cosmetics (icons, extra themes). Test every candidate against the contract
above, then against this table:

| Candidate | Verdict | Why |
|---|---|---|
| Cloud backup of user files | Good gate | You pay for storage; honest to charge |
| Extra themes / app icons | Good gate | Cosmetic, new-only (shipped themes stay free) |
| The app's core content | Never | Contract rule 1 |
| Basic table-stakes UX (search, bookmarks-the-noun) | Avoid | Free tier must stay a complete product |
| Sharing / referrals | Never | Contract rule 4 |
| A feature users already have | Never | Claw-back (rule 3) |

Sell a small honest list over a padded one; "coming soon" rows are allowed
but flagged (`upcoming: true`) and never the majority of the list.

## Store compliance (what App Review actually checks)

Encode these in the paywall UI; they are the common rejection reasons:

- The **billed amount is the most prominent price element**. For an annual
  plan that is the full yearly price; "$X/month equivalent" must be visually
  subordinate if shown at all.
- Auto-renewal disclosure near the CTA ("Renews yearly at X until cancelled
  in your store settings"). Trials: duration + post-trial price.
- **Restore purchases**, findable (paywall footer at minimum).
- Working **Terms of Use** (Apple's standard EULA link suffices) and
  **Privacy Policy** links, in the binary AND in App Store metadata.
- Prices only ever from `product.priceString` (store-localized). Never
  compose or hardcode a price in copy.
- Lifetime unlocks are **non-consumable** in both the store and the
  RevenueCat dashboard. A one-time product misconfigured as consumable gets
  consumed (SDK 10+) and cannot be restored: fatal for signed-out buyers.
- The FIRST IAP must be submitted attached to an app version, and the Paid
  Applications agreement must be Active or `getOfferings()` returns empty
  (the classic "RevenueCat is broken" false alarm).
- Android: `com.android.vending.BILLING` in the manifest; prefer
  `launchMode` `standard`/`singleTop` for the main activity, but if the app
  relies on `singleTask` for deep links, verify the purchase flow in sandbox
  before changing anything.

## Identity

- Do not pass an id at `configure()`; signed-out users purchase under a
  RevenueCat anonymous id.
- On sign-in call `logIn(<backend user id>)` (a UUID, never an email); the
  anonymous history merges into the identified customer.
- On sign-out call `logOut()` guarded by `isAnonymous()` (it rejects when
  already anonymous).
- Entitlements always survive via Restore because they belong to the store
  account, not the app account.
- Entitlement state does NOT go into the accounts sync registry: RevenueCat
  is already the cross-device source of truth.

## Analytics for monetization

Same taxonomy rules as `modules/analytics/event-guidelines.md`. The fixed
event set (extend the app's typed union):

- `Paywall Viewed` / `Paywall Dismissed` — prop `trigger`
  (`'profile'`, `'onboarding'`, or `'gate:<key>'`)
- `Purchase Started` / `Purchase Completed` — props `package_type`
  (`monthly|annual|lifetime`), `trigger`
- `Purchase Failed` — adds `reason` (`cancelled|error`)
- `Purchases Restored` — prop `found` (boolean)

Never send prices, receipts, transaction ids, or emails. Revenue truth lives
in the RevenueCat dashboard; product analytics only sees the funnel.

## How to add a gate

1. Confirm the feature passes the product contract (above). If it is a
   claw-back, stop and record the decision instead.
2. Add the key to `PlusFeature` and `GATE_COPY` in `lib/monetization/gates.ts`
   (benefit copy in the app's voice) and to `PAYWALL_FEATURE_ORDER`.
3. At the feature boundary: `const {unlocked} = useFeatureGate('<key>')`;
   when locked, present the paywall sheet with `trigger="gate:<key>"`.
   Never hard-block silently; the locked path always explains and offers.
4. Ship it in the same change as the feature (same policy as analytics).

### Checklist

- [ ] Not content, not a claw-back, not a growth loop
- [ ] Key + copy in `gates.ts`, listed on the paywall
- [ ] `useFeatureGate` at the boundary, paywall on locked
- [ ] Unconfigured builds still resolve the gate open (test exists)
- [ ] No SDK import outside `client.ts`

## Server entitlement mirror: when and how

Client-side `CustomerInfo` is the standard gate and is enough while every
gated feature runs on-device (cached offline, receipt-validated server-side
by RevenueCat). Build the webhook mirror only when something server-side
must vary by entitlement (storage quotas via RLS, web access, churn
automation). Pattern: the `revenuecat-webhook` edge-function stub that ships
with `modules/accounts` + an `entitlements` table
(user_id, entitlement, expires_at, source) with RLS owner-read and
`on delete cascade`. Webhooks for never-signed-in buyers arrive as
`$RCAnonymousID:...`: ignore them; the client remains the gating truth.

## Repo policy: gate as you build

Monetization hygiene is part of a feature, not a follow-up: a gated feature
lands with its gate key, paywall copy, boundary check, and analytics in the
same PR. Enforced the same way as analytics: the authoring rule block in the
app's CLAUDE.md (`template/paywall-authoring-rule.md`) plus PR review.
Exempt: refactors, styling, docs, content-only changes.

## Worked example: DailyBook Plus

One entitlement `plus`; products `db_plus_monthly` ($2.99), `db_plus_annual`
($19.99, "best value", preselected), `db_plus_lifetime` ($59.99,
non-consumable). Free forever: all books and audiobooks, the reader and
player, catalog read-along, dictionary, one translation language, the six
shipped themes, local imports, state sync. Gated: read-along alignment for
the user's OWN imported book + audio pairs, multi-language translation,
import cloud backup (flagship, future), alternate icons and new themes.
Kept free on principle: sharing (growth loop), the existing state sync
(claw-back). Full reasoning: `daily-book/docs/monetization-research.md`.

## Sources

- https://www.revenuecat.com/docs/getting-started/entitlements
- https://www.revenuecat.com/docs/getting-started/displaying-products
- https://www.revenuecat.com/docs/customers/user-ids
- https://www.revenuecat.com/docs/getting-started/restoring-purchases
- https://www.revenuecat.com/docs/integrations/webhooks
- https://www.revenuecat.com/pricing/ (free to $2.5k MTR/month, then 1%)
- https://developer.apple.com/app-store/review/guidelines/ (3.1.1, 3.1.2)
- https://developer.apple.com/app-store/subscriptions/
- https://www.revenuecat.com/docs/platform-resources/apple-platform-resources/app-store-small-business-program

## RevenueCat Paywalls UI (the dashboard-editable paywall), learned 2026-08-07

- `react-native-purchases-ui` presents the paywall built in RevenueCat's
  dashboard editor (attached to an offering). Use it where iterating without
  an app release matters most — DailyBook uses it at onboarding's end — and
  keep the in-app PaywallSheet for feature gates, where the trigger context
  writes the copy.
- Require it LAZILY in its own one-door file (DailyBook:
  `lib/monetization/paywall-ui.ts`), exactly like the purchases SDK: both are
  native modules, and a static import crashes every binary built before they
  existed.
- Every failure mode of a presented paywall — unconfigured keys, missing
  module, no offering, no paywall attached, SDK error — must resolve to
  "skipped" and the host flow must proceed. An onboarding that can hang on a
  paywall is worse than no paywall. `PAYWALL_RESULT.NOT_PRESENTED` and ERROR
  are both "skipped".
- Pin the skip contract with tests (DailyBook: monetization.test.ts,
  "onboarding paywall ship-dark").
- Pods to expect on iOS: RNPaywalls + RevenueCatUI (+ PurchasesHybridCommonUI),
  versioned in lockstep with RNPurchases/RevenueCat.
