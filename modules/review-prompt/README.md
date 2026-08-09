# review-prompt (store rating ask + in-app feedback)

Asks happy users for an App Store / Play Store rating at their happiest
moments, without spamming, and gives unhappy users a voice that reaches you
instead of the store. First built for DailyBook (2026-08-01); the policy
research lives in [review-prompt-guidelines.md](./review-prompt-guidelines.md)
and is the part most worth re-reading before touching anything.

## The shape

- **iOS (optional gate):** a bottom sheet asks "How is `<AppName>` so far?"
  with five stars. 5 → rated forever, native `requestReview()` attempted, and
  a thank-you state with a store deep link (the guaranteed path — the API
  cannot say whether Apple showed anything). 1–4 → a short in-app feedback
  box. The gate is HIG-discouraged but not prohibited on iOS; each app owner
  chooses it knowingly, and no-gate is the safer default.
- **Android (never a gate):** the qualifying moment calls the Play in-app
  review card directly. Play prohibits ANY question before its rating flow.
- **Both:** "Rate `<AppName>`" and "Share feedback" rows in settings
  (user-initiated, always allowed), and a developer block (show ask now,
  reset ledger).
- **Anti-spam ledger:** pure, tested decision rules — day-1 asks allowed,
  14-day first cool-off then 60, 3 per rolling 365, rated = never again,
  feedback = 180 days quiet, one attempt per session.
- **Feedback sink:** insert-only `app_feedback` table behind an
  `app-feedback` edge function (Supabase; works signed out; user-stamped when
  a session token arrives so account deletion cascades).

## Install into an app

Use the `setup-review-prompt` skill ([SKILL.md](./SKILL.md)). Manual
equivalent:

1. Copy `template/lib/review/`, `template/src/data/reviewLedger.ts`,
   `template/components/review/` into the app, then adapt the imports the
   files mark (theme, analytics, app version) and the copy (app name).
2. Replace the store ids in `lib/review/index.ts` (`storeReviewUrl()`): the
   iOS App Store id and the Android package name.
3. `npx expo install expo-store-review` (+ `pod install`; a NATIVE module —
   dev clients and store builds need a rebuild, and the lazy `require` in
   `lib/review` is what keeps older binaries from crashing at start).
4. Mount `<ReviewPromptHost />` once at app root.
5. Call `requestReviewAsk('<trigger>')` from 1–2 completed-task moments,
   after their celebration settles, never over it.
6. Add the settings rows (`openStoreReviewPage('settings')`, the feedback
   sheet via `<RateSheet startAt="feedback" via="settings" />`, and the dev
   block behind the app's developer flag).
7. Apply `template/supabase/migrations/app_feedback.sql` (renumber to the
   app's next migration slot) and deploy
   `template/supabase/functions/app-feedback` with `--no-verify-jwt`.
8. Add the five analytics events to the app's typed event union.

## Files

| File | Purpose |
|---|---|
| `review-prompt-guidelines.md` | THE rules: store policy, FTC, caps, engineering constraints |
| `template/src/data/reviewLedger.ts` | Pure anti-spam decision rules (port its tests too) |
| `template/lib/review/index.ts` | Orchestrator: platform split, session cap, store door, lazy SDK |
| `template/lib/review/feedback.ts` | Feedback POST (plain fetch, no supabase-js import) |
| `template/components/review/RateSheet.tsx` | The gate sheet (stars / feedback / thank-you states) |
| `template/components/review/ReviewPromptHost.tsx` | Root-mounted host; enforces iOS-only rendering |
| `template/supabase/…` | `app_feedback` table + edge function |

Everything is app-owned after vendoring (no core/re-sync split yet): the copy,
the caps and the triggers are product decisions each app tunes.
