# Review prompt guidelines (the rules that keep it legal and un-spammy)

These are the load-bearing rules behind the `review-prompt` module. They were
researched 2026-08-01 for DailyBook (see its `docs/decisions/review-prompt.md`)
and apply to every app this module is vendored into.

## The law of the platforms

1. **Google Play prohibits review gating outright.** The In-App Review API
   guidelines say the app must not ask the user ANY question before or while
   presenting the rating flow — sentiment questions ("do you like the app?")
   and predictive questions ("would you rate us 5 stars?") are named
   examples. On Android the ONLY compliant automatic ask is calling the Play
   card directly at a happy moment.
2. **The FTC's 2024 review rule** treats filtered review solicitation
   (steering expected-positive reviewers to the store and expected-negative
   ones away) as a violation with per-violation fines. This is a US-law
   consideration on top of store policy.
3. **Apple discourages but does not prohibit pre-screening.** The HIG says
   ask at moments of demonstrated satisfaction and never interrupt a task.
   A custom pre-prompt ("gate") is grey-zone on iOS and each app owner must
   choose it knowingly. DailyBook's owner chose an iOS-only gate; your app's
   owner may choose no gate at all, which is the safer default.
4. **`requestReview()` gives no signal on either platform.** Apple caps the
   native sheet at 3 per rolling 365 days per user, never shows it in
   TestFlight, and may suppress it silently; Play likewise decides quota
   internally. NEVER write "if the sheet did not show, then…" logic — the
   condition is unknowable. If a flow needs a guaranteed path, put a store
   deep link in reach (the gate's thank-you state does this).

## The anti-spam ledger

Candidates for an ask come from product moments; the ledger decides. Defaults
(DailyBook's owner-tuned values; tune per app, keep every cap):

- No minimum days since install (a day-1 delight moment is allowed).
- One ask attempt per app session.
- First cool-off 14 days, every later one 60 days.
- At most 3 asks per rolling 365 days (matches Apple's own cap).
- Rated once (5 stars on a gate, or a user-initiated store visit) → never
  ask again.
- Feedback sent → 180 days of quiet: they already told you what they think.

## Trigger selection

Ask at the moment the user is HAPPIEST and the task is DONE, never during
one: a completed book/level/workout, a goal landed, a streak milestone —
after its celebration settles, not over it. One or two triggers are enough;
the ledger makes more triggers safe but not more useful.

## The feedback path

Unhappy users need a door that reaches YOU and not the store, but on Android
it must never be a filter in front of the rating flow: expose it as an
always-available "Share feedback" row instead. The sink is an insert-only
table behind an edge function (works signed out, user-stamped when a session
exists so account deletion cascades). Feedback text NEVER goes to analytics —
track only `Feedback Sent {length, via}`.

## Engineering rules

- **Load the store-review SDK lazily** (`require` inside a try/catch, cached).
  A static import crashes AT APP START on any binary built before the native
  module was added — which is every existing install the day you ship this.
- The gate sheet must be mounted ONCE at app root (host component), so an ask
  fired from a screen's dismiss handler survives that screen popping.
- Ship a developer switch (show the ask now, reset the ledger): the flow is
  otherwise unreachable on demand, and TestFlight never shows Apple's sheet.
- Analytics events: `Review Prompt Shown {trigger, flow}` ·
  `Review Prompt Rated {stars}` · `Review Prompt Dismissed {trigger}` ·
  `Store Review Opened {via}` · `Feedback Sent {length, via}`.
