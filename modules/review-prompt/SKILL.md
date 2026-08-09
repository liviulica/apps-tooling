---
name: setup-review-prompt
description: Add a store rating ask (App Store / Play Store) with an anti-spam ledger and an in-app feedback path to the current Expo / React Native app, from the apps-tooling review-prompt blueprint. Use when the user wants a review prompt, rating ask, "ask for review modal", or in-app feedback box.
---

# setup-review-prompt

Vendors the `review-prompt` blueprint into the current Expo / React Native
app. The app owns everything after vendoring; the caps, copy and triggers are
product decisions.

**Read `review-prompt-guidelines.md` first, fully.** The platform split is
compliance, not style: Google Play prohibits any question before its rating
flow, so the rating gate exists (optionally) on iOS only. The FTC fines
filtered review solicitation. Do not improvise here.

## Steps

Create a todo per step and work through them in order.

1. **Owner decisions (ask, don't assume):**
   - Gate on iOS, or native-only everywhere? (No-gate is the safer default;
     the gate is HIG-discouraged. The owner chooses knowingly.)
   - Which 1–2 completed-task moments trigger the ask?
   - Ledger caps: defaults are day-1 allowed, 14-day first cool-off then 60,
     3 per rolling 365, rated = forever, feedback = 180 days quiet.
   - Where does feedback go? (Default: the bundled Supabase table+function.
     Needs the app to have a Supabase project; otherwise drop the feedback
     box and keep only the rating paths.)
2. Copy `template/` files into the app (`lib/review/`,
   `src/data/reviewLedger.ts`, `components/review/`), then fix the imports
   each file needs (theme, analytics `track`, app version) and the app name
   in the sheet copy. Sentence case; match the app's design system.
3. Replace the store ids in `storeReviewUrl()` (iOS App Store id, Android
   package name).
4. `npx expo install expo-store-review`; `cd ios && pod install`. Warn the
   user: native module — dev client and store builds need a rebuild. Keep
   the lazy `require` in `lib/review` exactly as shipped (older binaries
   crash at app start on a static import).
5. Mount `<ReviewPromptHost />` once at app root.
6. Wire `requestReviewAsk('<trigger>')` into the chosen moments, after their
   celebration/animation settles, never over it.
7. Settings rows: "Rate <AppName>" → `openStoreReviewPage('settings')`;
   "Share feedback" → `<RateSheet startAt="feedback" via="settings" />`;
   dev-only block (behind the app's developer flag or `__DEV__`):
   `forceShowReviewSheet()` and `resetReviewLedger()`.
8. Supabase: renumber `app_feedback.sql` into the app's migration sequence,
   `supabase db push`, `supabase functions deploy app-feedback
   --no-verify-jwt`. Probe live: a valid POST stores, junk 400s, an anon
   REST select returns `[]`.
9. Analytics: add the five events to the app's typed union and confirm the
   calls compile. Never put feedback text in an event.
10. Tests: port DailyBook's four suites (ledger, orchestrator, no-module,
    sheet) and adapt labels/copy. The no-module suite is the crash guard —
    do not skip it.
11. Record the decision: the platform split and the owner's gate choice go
    in the app's decision records (and its iOS↔Android differences doc, if
    it keeps one).
