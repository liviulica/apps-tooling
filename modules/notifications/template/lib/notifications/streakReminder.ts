/**
 * When to remind a reader about their streak.
 *
 * Pure, so the rule can be tested without a native module, a clock or a
 * scheduler. Everything here takes an explicit `now` for the same reason.
 *
 * THE RULE, from the owner's call and the research behind it (2026-08-12):
 * remind them 23.5 hours after their last reading session, not at a fixed hour.
 * Duolingo landed on exactly this and abandoned user-chosen reminder times to do
 * it, because when someone read yesterday predicts when they are free today far
 * better than a preference they typed once. Leanplum measured 5.3% open rates for
 * behaviour-timed sends against 1.9% for scheduled blasts.
 *
 * 23.5 rather than 24 so the reminder drifts slightly EARLIER each day instead of
 * later. Twenty-four hours exactly would creep past the reader's window every
 * time a session ran long, and a reminder that arrives after the moment has
 * passed is worse than none.
 */

/** Local hour used before a reader has any session history. Owner's choice. */
export const FALLBACK_HOUR = 20;

/** The Duolingo interval. Not 24: see the note above. */
export const REMINDER_GAP_MS = 23.5 * 60 * 60 * 1000;

/** How close to `now` a reminder may be scheduled before it is pointless. */
const MIN_LEAD_MS = 60 * 1000;

export type ReminderInput = {
  /** Now, in ms. */
  now: number;
  /** End of the reader's most recent reading session, ms. Null if never. */
  lastSessionAt: number | null;
  /** Their current streak, in days. 0 means nothing to protect. */
  currentStreak: number;
  /** True once today's goal is met: there is nothing left to remind about. */
  goalReachedToday: boolean;
  /** False when the reader declined, or has not been asked. */
  enabled: boolean;
};

export type ReminderPlan =
  | {kind: 'none'; reason: 'disabled' | 'no-streak' | 'goal-already-met'}
  | {kind: 'schedule'; at: number; basis: 'last-session' | 'fallback-hour'};

/**
 * What the app should have scheduled right now.
 *
 * Returning a PLAN rather than doing the scheduling keeps the decision testable
 * and keeps the reasons legible: "why did nobody get a reminder" is answerable
 * from the `reason` without instrumenting the scheduler.
 */
export function planStreakReminder(input: ReminderInput): ReminderPlan {
  if (!input.enabled) {
    return {kind: 'none', reason: 'disabled'};
  }
  // Nothing to lose yet. A "don't lose your streak" on day zero is a lie, and
  // the first notification a reader gets teaches them what the channel is for.
  if (input.currentStreak < 1) {
    return {kind: 'none', reason: 'no-streak'};
  }
  // They already read today. Sending it anyway is the single fastest way to
  // teach someone to ignore, or mute, everything the app ever sends.
  if (input.goalReachedToday) {
    return {kind: 'none', reason: 'goal-already-met'};
  }

  if (input.lastSessionAt != null) {
    const at = input.lastSessionAt + REMINDER_GAP_MS;
    if (at - input.now >= MIN_LEAD_MS) {
      return {kind: 'schedule', at, basis: 'last-session'};
    }
    // The window has already passed today (a long gap, or a session late last
    // night). Fall through to the fixed hour rather than firing immediately.
  }

  return {kind: 'schedule', at: nextFallbackHour(input.now), basis: 'fallback-hour'};
}

/**
 * The next occurrence of the fallback hour, local. Today if it is still ahead by
 * a useful margin, tomorrow otherwise.
 */
export function nextFallbackHour(now: number, hour: number = FALLBACK_HOUR): number {
  const d = new Date(now);
  const candidate = new Date(d);
  candidate.setHours(hour, 0, 0, 0);
  if (candidate.getTime() - now < MIN_LEAD_MS) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate.getTime();
}

/**
 * The only copy this channel sends, for now (owner: streak only). Kept here so
 * the message and the rule that fires it stay in one file.
 */
export function streakReminderCopy(currentStreak: number): {title: string; body: string} {
  return {
    title: 'Don’t lose your streak',
    body:
      currentStreak === 1
        ? 'You read yesterday. A few pages today makes it two.'
        : `${currentStreak} days so far. A few pages keeps it going.`,
  };
}
