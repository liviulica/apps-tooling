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

## Worked example: DailyBook Scholar (shipped 1.5.0, 2026-08)

One entitlement `plus`; products `db_scholar_monthly`, `db_scholar_annual`
(preselected, 1-week free trial) and `db_scholar_lifetime` (NON-consumable).
US tier prices $2.99 / $19.99 / $49.99; every customer sees their own store's
localized strings, which is why nothing in the code composes a price.

Free forever: all books, audiobooks and films, the reader and player, catalog
read-along, dictionary, one translation language, the shipped themes, local
imports, state sync, sharing. Gated (three at launch, all tool-shaped):
read-along alignment for the user's OWN imported book + audio pairs, translation
languages beyond the first, notebook export to Obsidian/Notion/Anki. Kept free
on principle: sharing (growth loop) and the existing state sync (claw-back).

The shape worth copying: each gate's benefit line lives beside its key in
`gates.ts`, the paywall renders that list, and a gate trigger lifts its own
benefit to the top. Full reasoning:
`daily-book/docs/decisions/monetization-gating.md`.

## The remote paywall: tried, retired, and what it costs to try (2026-08-09)

`react-native-purchases-ui` presents the paywall built in RevenueCat's
dashboard editor. The pitch is real: copy, layout, pricing emphasis and A/B
tests change without an app release. The app this module was built against
adopted it at every trigger on 2026-08-08 and **retired it the next day**,
removing the dependency. Both calls were made with the paywall in front of a
reviewer on a physical device, so this section is a measurement, not taste.

What went wrong, in the order it was found:

- **The editor could not reliably express selection state.** Two of three
  package rows shipped with Selected values inside their Default state, so they
  looked chosen when they were not. Fixing that left the light palette
  half-applied, with the selected-row fill behind an override path the
  dashboard's own assistant reported it could not reach.
- **A device in light mode rendered the dark palette** after the light values
  were set. The editor preview disagreed with the device, which is the worst
  property a remote surface can have: you cannot trust the thing you iterate in.
- **It follows the SYSTEM appearance, not the app's theme.** Any app with more
  than light/dark themes (this one has five) will show most of its users a
  paywall that looks like a different product. No configuration fixes this.
- **VoiceOver: no selected trait on the package rows, unlabeled close button.**
  Template limitations, not configuration.
- **It cannot reorder benefits per trigger.** One dashboard sheet has to speak
  for every gate, so a reader who tapped a locked export gets a paywall that
  leads with something else. The local sheet lifts the triggering feature to the
  top of the list, which is a conversion argument as much as a courtesy.
- **Every visual tweak needed a device round-trip.** The local sheet is
  testable in Jest down to its rendered copy.

So the module ships **one surface: the app's own `PaywallSheet`**, at every
trigger including onboarding. What that gives up, knowingly: remote copy
iteration and A/B tests without a release. The funnel events that would justify
building a remote surface again are all still emitted.

**If you do reach for the remote paywall anyway**, the rules that applied then
still apply: require it LAZILY in its own one-door file (it is a native module,
and a static import crashes every binary built before the module existed); every
failure mode — unconfigured keys, missing module, no offering, none attached,
SDK error — must resolve to "skipped" with the host flow proceeding, because an
onboarding that can hang on a paywall is worse than no paywall; and
`PAYWALL_RESULT.NOT_PRESENTED` and `ERROR` are both "skipped". Two traps that
cost real debugging time there:

- **Do not race `presentPaywallIfNeeded` against a timeout.** That promise is
  pending for as long as the customer is *reading*, so a timer cannot tell "the
  bridge wedged" from "they are still deciding". A 45s race resolved
  "unavailable" underneath the still-open sheet, the gate mounted the local
  fallback behind it, and dismissing one revealed the other. If a flow needs a
  bound, bound it in that flow, not in the presenter.
- **Latch re-entrancy.** A second tap while the native sheet is coming up starts
  a second presentation, the SDK rejects it, the rejection reads as
  "unavailable", and the fallback mounts behind the real paywall — the same
  two-paywall stack through a different door.

## Trial claims: eligibility, not availability (2026-08-09, blocker)

A store product advertises its introductory offer to everyone. On iOS,
eligibility is **per account**: one free trial per subscription group. So
`product.introPrice` existing does NOT mean this customer may start a trial, and
a paywall built from it alone promises "1 week free" to someone Apple will
charge full price on the very next sheet. That is a billing-promise mismatch and
a 3.1.2 risk, and it survived one adversarial review before being caught in a
second.

The module's rule, implemented in `client.ts` + `packages.ts`:

- Ask `Purchases.checkTrialOrIntroductoryPriceEligibility(productIds)` for
  every product carrying a zero-price intro offer.
- Only a positively `ELIGIBLE` answer keeps the trial. `UNKNOWN` and any thrown
  error show plain pricing — the SDK's own documented guidance for UNKNOWN is to
  display non-intro pricing rather than create a misleading situation.
- **Android**: the API always answers UNKNOWN there, and Google curates offers
  per account before the SDK sees them, so the offer's presence IS the answer.
  `mapPackages(pkgs, null)` means "the store already decided".
- A **paid** introductory price is not a trial. It maps to no trial at all, so
  the sheet shows the base price and the store charging less at first is a
  pleasant surprise rather than a misquote.
- A multi-cycle free offer spans `cycles × period`. Two cycles of one week is
  "2 weeks free"; stating one cycle understates the store's own terms.

## Value claims need evidence

The savings badge on an annual package is computed from the two store prices
(`annualSavingsPercent`), returns null when either is missing or the saving is
under 5%, and the sheet renders **no badge at all** in that case. The tempting
fallback — "Best value" whenever the number is unavailable — puts an
unsupported claim on a package that might be a lone annual with nothing to
compare against, or genuinely more expensive than twelve monthly payments.

## One dismissal per presentation

A bottom-sheet library fires its own `onDismiss` after your close button
already ran, and a purchase or restore that closes the sheet gets the same echo.
Unguarded, that double-counts the funnel exit and runs the OWNER's dismiss
handler twice — which, when the owner is onboarding, completes onboarding twice
and races two flag writes. Funnel every exit through one single-fire guard
(`PaywallSheet`'s `fireDismiss`), and let flows that finish on dismissal keep
their own guard too.

## Presenting a paywall inside a host flow

Onboarding is the hard case, because it must never trap a first run:

- Prefetch packages while the user is still busy with earlier steps.
- Present only when there is a real offer: configured, not already entitled,
  and packages actually present.
- **A pending fetch is not an empty offering.** Deciding the instant the flow
  ends means a slow store silently skips the paywall. Wait for the in-flight
  fetch — with a belt (4s) so the flow can never hang on it.
- Every way out of the sheet must land the user in the app exactly once.

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
