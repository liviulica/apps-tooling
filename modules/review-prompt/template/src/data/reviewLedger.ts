/**
 * The review-ask ledger: the pure rules that stop the app from spamming
 * readers for ratings. Persistence and platform behaviour live in
 * lib/review/; this module owns only the decision, so every cap is testable
 * without a device.
 *
 * Owner-set caps (2026-08-01, docs/superpowers/specs/2026-08-01-review-prompt-
 * design.md): a reader may be asked on day 1 (no minimum age since install),
 * the first cool-off is 14 days, every later one 60; at most 3 asks in any
 * rolling 365 days; rated once means never asked again; feedback sent means
 * 180 days of quiet. Apple's own 3-per-365 throttle sits on top of ours.
 */

export interface ReviewLedgerState {
  /** First time the ledger was touched on this device (ISO). */
  firstSeenAt: string;
  /** Every time an ask was actually shown (ISO, append-only). */
  asks: string[];
  /** Set once the reader rated (5 stars on the iOS gate, or the Settings
   *  "Rate DailyBook" row). Never ask again after this. */
  ratedAt?: string;
  /** Last time the reader sent feedback: they already told us what they
   *  think, so asking again soon would be deaf. */
  feedbackAt?: string;
}

const DAY = 24 * 60 * 60 * 1000;

/** Days of quiet after the reader sent feedback. */
export const FEEDBACK_QUIET_DAYS = 180;
/** Cool-off after the FIRST ask; later asks wait longer. */
export const FIRST_COOL_OFF_DAYS = 14;
export const LATER_COOL_OFF_DAYS = 60;
/** Hard cap inside any rolling 365 days (Apple enforces its own on top). */
export const MAX_ASKS_PER_YEAR = 3;

export function emptyLedger(nowIso: string): ReviewLedgerState {
  return {firstSeenAt: nowIso, asks: []};
}

/** Whether a qualifying moment may actually become an ask. */
export function shouldAsk(state: ReviewLedgerState, nowIso: string): boolean {
  const now = Date.parse(nowIso);
  if (state.ratedAt) {
    return false;
  }
  if (state.feedbackAt && now - Date.parse(state.feedbackAt) < FEEDBACK_QUIET_DAYS * DAY) {
    return false;
  }
  const askTimes = state.asks.map(Date.parse).filter(t => !Number.isNaN(t));
  const inWindow = askTimes.filter(t => now - t < 365 * DAY);
  if (inWindow.length >= MAX_ASKS_PER_YEAR) {
    return false;
  }
  if (askTimes.length > 0) {
    const last = Math.max(...askTimes);
    const coolOff = askTimes.length === 1 ? FIRST_COOL_OFF_DAYS : LATER_COOL_OFF_DAYS;
    if (now - last < coolOff * DAY) {
      return false;
    }
  }
  return true;
}

/** Parse a stored ledger, tolerating anything (a corrupt read must not crash
 *  a celebration screen; it just resets the ledger). */
export function parseLedger(raw: string | null, nowIso: string): ReviewLedgerState {
  if (!raw) {
    return emptyLedger(nowIso);
  }
  try {
    const data = JSON.parse(raw) as Partial<ReviewLedgerState>;
    return {
      firstSeenAt: typeof data.firstSeenAt === 'string' ? data.firstSeenAt : nowIso,
      asks: Array.isArray(data.asks) ? data.asks.filter(a => typeof a === 'string') : [],
      ratedAt: typeof data.ratedAt === 'string' ? data.ratedAt : undefined,
      feedbackAt: typeof data.feedbackAt === 'string' ? data.feedbackAt : undefined,
    };
  } catch {
    return emptyLedger(nowIso);
  }
}
