# notifications (local habit reminders)

Streak and daily-goal reminders for Expo/React Native apps, with no backend.
Built for DailyBook 1.5.1, then generalized.

The product rules live in
[notification-guidelines.md](notification-guidelines.md) — when to ask, how to
ask, what makes a habit reminder help rather than get you muted. **Read that
first.** This README is the code contract.

## What this module is, and is not

**Is:** local notifications, scheduled by the app, for facts the device already
knows — a streak at risk, a goal unmet, a timer done.

**Is not:** remote push. No APNs key, no Firebase project, no device-token
table, no edge function, no schedule to operate. That is deliberate. Only
content decided AFTER the app was last opened needs a server, and taking that on
before the local tier has proved readers keep the permission is how the whole
feature stalls.

It also means reminders work for a **signed-out** reader, which matters if the
app treats accounts as optional.

## The shape

Two files, and the split is the point.

**`streakReminder.ts` is pure.** It takes `now`, the last session time, the
streak, and whether the reader enabled reminders, and returns a PLAN:

```ts
type ReminderPlan =
  | {kind: 'none'; reason: 'disabled' | 'no-streak' | 'goal-already-met'}
  | {kind: 'schedule'; at: number; basis: 'last-session' | 'fallback-hour'}
```

Returning a plan rather than performing one buys two things. Every rule in the
guidelines becomes an ordinary unit test with no native module and no clock. And
"why did nobody get a reminder" is answerable from `reason` without
instrumenting the scheduler.

**`index.ts` is the only file that touches anything real** — the scheduler,
storage, the OS. It applies a plan, and it always cancels before scheduling, so
calling it after every session is idempotent: one reminder exists, or none,
never a pile.

## The timing rule

Last session **+ 23.5 hours**, falling back to a fixed local hour when there is
no history or the computed time has already passed.

Not a time the reader picked, and not 24 hours. The reasoning and the evidence
are in the guidelines; the short version is that behaviour predicts availability
far better than a stated preference, and 24 exactly makes the reminder drift
later every day until it leaves the reader's window.

## Wiring

**After every session** (wherever the app records that the habit happened):

```ts
void recordSessionEnd().then(() =>
  syncStreakReminder({
    now: Date.now(),
    currentStreak: streak.currentStreak,
    goalReachedToday: daily.goalReached,
  }),
).catch(() => {});
```

Fire-and-forget on purpose: in DailyBook this runs on every page turn and must
never make one wait on storage. Call it on EVERY session, not only when the goal
is reached — that is what keeps the reminder tracking real behaviour, and it is
also what cancels it the moment the goal is met.

**The priming screen**, late in onboarding, after a choice that implies intent:

```tsx
<NotificationsStep
  onDone={({asked, granted}) => {
    void markNotificationsAsked();          // always: never re-ask a decliner
    void setStreakRemindersEnabled(granted); // only what the OS actually said
    next();
  }}
/>
```

`asked` and `granted` are separate because they differ: a reader can accept your
screen and decline the system dialog. Persisting "asked" regardless is what stops
the app nagging every launch.

## Two things that will bite

**The decline button must not raise the system prompt.** That is the entire
value of the pattern, and a broken version looks and behaves identically. Assert
it in a test.

**Guard the double tap with a ref, not state.** `setState` does not apply until
the next render, so two taps in one tick both fire — on iOS that burns the one
prompt you get. This shipped in DailyBook and a test caught it.

## Ownership

`streakReminder.ts` and `index.ts` are **core** (re-synced from the blueprint).
The priming screen is **app-owned**: its copy, illustration and placement are
product decisions. Keep the two-button contract and change everything else.

## Verify

See `blueprint.json` → `verify`. The ones worth doing by hand, on a development
build or the iOS Simulator (which does deliver scheduled local notifications):
grant permission, act once, confirm exactly one reminder is scheduled at
last-session + interval; act again and confirm it MOVED rather than a second
appearing; meet the goal and confirm it is gone.
