# Notification guidelines

Rules for habit notifications (streaks, daily goals, practice reminders) in a
consumer app. Written after building them for DailyBook, and grounded in what
the apps that live or die by this have already learned in public.

Read this before designing any notification. The README next door is the code
contract; this is the part that decides whether the feature helps or gets your
app muted.

## The two budgets you are spending

Every notification decision spends one of two things, and neither refills.

**The permission prompt.** On iOS you get exactly ONE system prompt per install,
ever. A "Don't Allow" is permanent unless the reader goes into iOS Settings and
finds your app, which effectively nobody does. Android 13+ works the same way in
practice.

**The reader's patience.** A channel that sends one useless message teaches the
reader that everything from you is useless. They do not unsubscribe from the bad
notification, they mute the app, and that takes the good one with it.

Every rule below is downstream of those two facts.

## Asking for permission

### Never raise the system prompt cold

Put your own screen in front of it. The reader says yes or no to YOU first, and
the system prompt is only raised for someone who already agreed.

The asymmetry is the whole point:

| | Cold system prompt | Soft ask first |
|---|---|---|
| They say yes | granted | granted |
| They say no | **permanently lost** | costs nothing, ask again another day |

There is no case where the cold prompt does better. This pattern is sometimes
called a pre-permission or priming screen, and it is standard for a reason.

### Ask when they have something to lose, not at first launch

A reminder about a habit is meaningless before the habit exists. Asking on
launch one gets you a decision from someone who does not yet know what your app
does.

Good moments, roughly in order:

1. Just after the first real act of the thing you will remind them about
   (finished a first session, hit a first goal).
2. Late in onboarding, AFTER they have made a choice that implies intent —
   picked interests, picked content, set a goal. DailyBook asks here: after the
   reader has chosen books, before the library is built. By then the ask reads
   as "keep up with the thing you just set up".
3. From a settings screen, for readers who go looking.

Bad moments: the first screen, mid-task, immediately after a paywall, or
straight after any other permission prompt.

### Show the actual notification in the ask

Draw the real message, with real copy, in the priming screen. Agreeing to
something unseen is not agreement, and a reader who has seen exactly what
arrives is far less likely to mute it later.

### Say what the frequency is, and then honour it

"One reminder a day" is a promise. If you later add a second daily message, you
broke it, and the reader has no way to complain except muting you.

### Never re-raise the prompt after a decline

Remember that they were asked. Re-showing a priming screen every launch is the
behaviour that gets apps described as spammy, and it converts nobody. Track
"asked" separately from "enabled": a reader who declined has been asked and is
not enabled, and conflating those two is how the nagging starts.

## Timing: the single highest-leverage decision

### Send it when they were last active, not at a time you picked

The best predictor of when someone can act on a reminder is when they last did
the thing. Not their stated preference, not your marketing calendar.

Duolingo — whose entire retention model is a streak — sends its practice
reminder about **23.5 hours after the reader's last session**, on the finding
that people return at the same time of day they returned before. They
**abandoned user-chosen reminder times** to do it, because behaviour predicted
availability better than a preference the reader typed once.

The measured gap is large. Leanplum found roughly **5.3%** open rates for sends
timed to the individual's active window, against **1.9%** for scheduled blasts
and **1.7%** for timezone-scheduled sends. Later vendor studies (Iterable,
Braze) put individual send-time optimisation at +34% to +74% over fixed
windows. Treat the exact figures as vendor numbers; the direction is consistent
everywhere.

### Use an interval slightly UNDER 24 hours

23.5, not 24. With exactly 24 hours the reminder drifts LATER every time a
session runs long, and it walks out of the reader's window within a week. Just
under 24 makes it drift earlier instead, which is harmless.

### Always have a fallback hour

A reader with no history yet needs something. Pick one plausible evening hour in
their local time (DailyBook uses 20:00), and use it only until real behaviour
exists. Also fall back to it when the computed time has already passed today,
rather than firing immediately — a notification triggered by opening the app is
the worst one you can send.

### Never schedule something seconds away

Enforce a minimum lead time. A reminder that fires while the reader is holding
the phone, inside your app, is pure noise.

## Streak and habit rules

### Cancel the moment the thing is done

The fastest way to get muted is to warn someone about something they already
did. When today's goal is met, the reminder must be CANCELLED, not sent and
ignored. This is the rule most often got wrong, because the scheduling code and
the goal code usually live far apart.

### Do not claim a streak that does not exist

"Don't lose your streak" on day zero is a lie, and the FIRST notification a
reader receives defines what they think the channel is for. Send nothing until
there is genuinely something at risk.

### One reminder per day, and earn the second one

A last-chance nudge later in the evening is defensible only once the streak is
long enough that losing it would actually sting. Ship one, measure, then decide.
Never ship two on day one.

### Reschedule, never accumulate

Use ONE identifier and treat scheduling as replace. Cancel unconditionally
before scheduling. Apps that add rather than replace end up sending three
reminders in an evening, and the reader cannot tell that it was a bug.

### Keep the copy honest, specific and short

Name the real number ("7 days so far"), never a fake one. Watch the singular:
"1 days" is the tell of a message nobody read aloud. And do not manufacture
panic — the streak is the reader's, not a debt they owe you.

### Think hard before sending a "you lost it" message

A broken-streak notification is either kind or the most unwelcome message your
app will ever send, and which one depends on tone and on how long the streak
was. Ship the protective reminder first, and treat this as a separate decision
with its own evidence.

## What NOT to send

Distinguish a service from a message:

- **A service** is something the reader opted into and would miss: their streak
  is at risk, their download finished, their turn in a game.
- **A message** is something you want them to see: weekly stats, a new feature,
  an editorial pick, a sale.

Default services ON when permission is granted; default messages OFF with a
toggle. Mixing them into one permission means a reader who wanted the reminder
gets marketing, and the only tool they have is muting everything.

DailyBook's first cut ships the streak reminder alone for exactly this reason.

## Local before remote

Most habit notifications need no server at all. If the fact being reported
already lives on the device — a streak, a goal, a timer, a download — schedule
it locally.

What that buys you: no APNs key, no Firebase project, no device-token table, no
edge function, no schedule to operate, no delivery to debug. Crucially, local
notifications also work for a signed-out reader, which matters if your app
treats accounts as optional.

Only content decided AFTER the app was last opened (an editorial pick, another
user's action, a price change) needs real push. Ship the local tier first, prove
readers keep the permission, and only then take on the backend. Do not let the
remote tier hold the local one hostage.

## Analytics: two events, not one

Track what the reader chose in YOUR screen and what the OS then said, as
separate events. They diverge whenever someone accepts the priming screen and
declines the system dialog, and that gap is the only way to tell whether the
priming screen is earning its keep. One combined event hides it.

Also worth having: which reason a reminder was NOT scheduled. "Nobody got a
reminder" is otherwise unanswerable without instrumenting the scheduler.

No content in properties, ever: no book titles, no message bodies, no free text.
Counts, enums, booleans, durations.

## Testing what is basically untestable

Notifications resist testing because the interesting parts are the OS and the
passage of time. Split them:

- **Make the decision pure.** A function taking `now`, the streak, the last
  session and the enabled flag, returning a PLAN rather than performing it. All
  the interesting rules become ordinary unit tests, including every reason for
  scheduling nothing.
- **Mock only the scheduler.** One thin module owns the native calls; tests
  assert what it was asked to do.
- **Test the negatives hardest.** That declining does not raise the system
  prompt is the assertion protecting the whole pattern — and a broken version
  looks and feels identical, so nothing else will catch it.
- **Check permission at schedule time, not from your stored flag.** The reader
  can revoke in Settings and your app is never told. Trusting the flag means
  scheduling into a void and believing it worked.
- **Guard the double tap with a ref, not state.** A state flag does not apply
  until the next render, so two taps in one tick both raise the prompt. On iOS
  that burns the single prompt. This one bit DailyBook and was caught by a test.

## Sources

- Duolingo's 23.5-hour, behaviour-inferred reminder and the abandonment of
  user-set times: [push notification strategy
  teardown](https://pushpilot.ai/blog/duolingo-push-notification-strategy-teardown),
  [habit-forming reminders
  breakdown](https://www.digia.tech/post/duolingo-habit-forming-reminders-retention-architecture/)
- Behaviour-timed vs scheduled vs timezone-scheduled open rates, and send-time
  optimisation lift: [push notification strategy
  overview](https://clevertap.com/blog/push-notification-strategy/)
- Applied end to end in DailyBook 1.5.1
  (`lib/notifications/`, `components/onboarding/NotificationsStep.tsx`,
  `todos/2026-07-30-add-push-notifications.md`).
