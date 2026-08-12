/**
 * The streak reminder, applied.
 *
 * `streakReminder.ts` decides WHAT should be scheduled and is pure. This file is
 * the only thing that touches the scheduler, storage or the OS, so the decision
 * stays testable and the side effects stay in one place.
 *
 * Local notifications only. Streak reminders need no APNs key, no Firebase, no
 * device-token table and no server, and they work signed out, which the accounts
 * rule in CLAUDE.md requires. "Book of the week" is the only notification that
 * would need any of that, and it is deliberately not built
 * (todos/2026-07-30-add-push-notifications.md).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import {planStreakReminder, streakReminderCopy, type ReminderInput} from './streakReminder';

const ENABLED_KEY = '@daily_book_streak_reminder';
const ASKED_KEY = '@daily_book_notifications_asked';
const LAST_SESSION_KEY = '@daily_book_last_session_at';

/** One id, reused, so scheduling is always "replace" and never "add another". */
const REMINDER_ID = 'daily-book-streak-reminder';

type NotificationsModule = {
  requestPermissionsAsync: () => Promise<{status: string}>;
  getPermissionsAsync: () => Promise<{status: string}>;
  scheduleNotificationAsync: (req: unknown) => Promise<string>;
  cancelScheduledNotificationAsync: (id: string) => Promise<void>;
  setNotificationHandler: (handler: unknown) => void;
};

/**
 * Required LAZILY, and every failure swallowed. expo-notifications is a native
 * module: a binary built before it existed would otherwise throw at import time
 * and take down whatever imported this, which includes the reading context.
 */
function native(): NotificationsModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-notifications') as NotificationsModule;
  } catch {
    return null;
  }
}

export async function notificationsAsked(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ASKED_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function markNotificationsAsked(): Promise<void> {
  try {
    await AsyncStorage.setItem(ASKED_KEY, '1');
  } catch {
    // A lost flag only means the reader may be asked again. Harmless.
  }
}

export async function streakRemindersEnabled(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ENABLED_KEY)) === '1';
  } catch {
    return false;
  }
}

/** Turning it off cancels immediately; leaving it on is not enough to schedule. */
export async function setStreakRemindersEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(ENABLED_KEY, enabled ? '1' : '0');
  } catch {
    // fall through: the cancel below still matters more than the flag
  }
  if (!enabled) {
    await cancelStreakReminder();
  }
}

/**
 * Remember when the reader last read, which is what the 23.5-hour rule is
 * measured from. Stored rather than derived because reading progress does not
 * keep a session end time, and the reminder needs one even after a relaunch.
 */
export async function recordSessionEnd(at: number = Date.now()): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_SESSION_KEY, String(at));
  } catch {
    // Without it the plan falls back to 20:00, which is the designed fallback.
  }
}

export async function lastSessionAt(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_SESSION_KEY);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export async function cancelStreakReminder(): Promise<void> {
  try {
    await native()?.cancelScheduledNotificationAsync(REMINDER_ID);
  } catch {
    // Cancelling something that was never scheduled is not an error.
  }
}

/**
 * Bring the OS into line with what the rule says should be scheduled.
 *
 * Always cancels first, so this is idempotent and safe to call after every
 * session: one reminder exists, or none, never a pile of them.
 *
 * Returns the plan it applied, which is what makes this observable in tests and
 * in the developer console without reading the OS back.
 */
export async function syncStreakReminder(
  input: Omit<ReminderInput, 'enabled' | 'lastSessionAt'> & {
    /** Omit to read the stored preference. */
    enabled?: boolean;
    /** Omit to read the stored session time. */
    lastSessionAt?: number | null;
  },
) {
  const enabled = input.enabled ?? (await streakRemindersEnabled());
  const last = input.lastSessionAt !== undefined ? input.lastSessionAt : await lastSessionAt();

  const plan = planStreakReminder({
    now: input.now,
    currentStreak: input.currentStreak,
    goalReachedToday: input.goalReachedToday,
    lastSessionAt: last,
    enabled,
  });

  // Cancel unconditionally: the previous reminder is wrong the moment anything
  // changes, and leaving it while adding a new one is how readers end up with
  // two.
  await cancelStreakReminder();

  if (plan.kind === 'none') {
    return plan;
  }

  const mod = native();
  if (!mod) {
    return plan;
  }
  // Permission is checked here rather than assumed from the stored flag: the
  // reader can revoke it in iOS Settings at any time, and scheduling into a
  // revoked permission fails silently.
  try {
    const {status} = await mod.getPermissionsAsync();
    if (status !== 'granted') {
      return plan;
    }
    const copy = streakReminderCopy(input.currentStreak);
    await mod.scheduleNotificationAsync({
      identifier: REMINDER_ID,
      content: {title: copy.title, body: copy.body},
      trigger: {type: 'date', date: new Date(plan.at)},
    });
  } catch {
    // A scheduler that refuses is not worth crashing a reading session over.
  }
  return plan;
}

export {planStreakReminder, streakReminderCopy} from './streakReminder';
export type {ReminderInput, ReminderPlan} from './streakReminder';
