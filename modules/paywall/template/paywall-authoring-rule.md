<!-- BEGIN paywall-authoring-rule (managed by apps-tooling/modules/paywall) -->
## Monetization (required when touching features or the paywall)

- **Content is never paywalled.** The paid tier sells tools; whatever the
  app's core content is (books, recipes, workouts…) has no gate key and must
  never get one.
- Never claw back: a feature that shipped free to public users stays free.
  Gate only new capabilities (or ones that never reached a store build, as
  an explicit, documented decision).
- Never gate growth loops (sharing, referrals, onboarding) or the account.
  Purchases must work signed-out (RevenueCat anonymous ids).
- Every gated feature gets a key in `lib/monetization/gates.ts` (with its
  paywall copy) in the same change that builds the feature, and is checked
  via `useFeatureGate('<key>')`. Unconfigured builds resolve every gate OPEN.
- Never import `react-native-purchases` outside `lib/monetization/client.ts`,
  where it is required LAZILY (a static import crashes binaries built before
  the native module existed). Do NOT add `react-native-purchases-ui`: the
  paywall is `components/PaywallSheet.tsx` at every trigger.
- Prices only from the store (`priceString`); never hardcode or compose them.
  A "per month, billed annually" line composes a price. Paywall UI must keep:
  billed amount most prominent, auto-renew wording for subscriptions and never
  for lifetime, Restore purchases, Terms + Privacy links.
- **Never claim a free trial the customer may not get.** The trial comes from
  `pkg.trial`, which is set only when the store reported this account eligible
  (iOS eligibility is per subscription group). Never hardcode a trial string.
- **Value claims carry evidence.** A savings badge renders only when the
  percentage is computable from real store prices; with no number there is no
  badge, never a bare "best value".
- One dismissal per paywall presentation: sheet libraries echo `onDismiss`
  after your own close handler, and any flow that finishes on dismissal
  (onboarding) must be idempotent.
- Monetization analytics events (add to the app's typed event union):
  `Paywall Viewed` / `Paywall Dismissed` (prop `trigger`),
  `Purchase Started` / `Purchase Completed` / `Purchase Failed`
  (props `package_type`, `trigger`, `reason`), `Purchases Restored`
  (prop `found`). No prices, receipts, or ids in properties; revenue truth
  lives in RevenueCat, product analytics only sees the funnel.

Full rules: `apps-tooling/modules/paywall/paywall-guidelines.md`.
<!-- END paywall-authoring-rule -->
