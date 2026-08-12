'use strict';

/**
 * Pure metric functions. No network, no clock, no files.
 *
 * The invariant across all of them: return null when the input cannot support
 * an answer. A rendered number is a claim, and 0, NaN and Infinity all read
 * as claims to a person skimming a report. Callers decide how to print null;
 * these functions never guess.
 */

/**
 * null when either side is unknown, so a delta is never computed against a
 * false zero.
 *
 * @param {number | null | undefined} current
 * @param {number | null | undefined} previous
 * @returns {{value: number, previous: number, change: number, direction: 'up' | 'down' | 'flat'} | null}
 */
function delta(current, previous) {
  if (typeof current !== 'number' || !Number.isFinite(current)) {
    return null;
  }
  if (typeof previous !== 'number' || !Number.isFinite(previous)) {
    return null;
  }
  const change = current - previous;
  return {
    value: current,
    previous,
    change,
    direction: change > 0 ? 'up' : change < 0 ? 'down' : 'flat',
  };
}

/**
 * x / y, or null when y cannot divide.
 * @param {number | null | undefined} numerator
 * @param {number | null | undefined} denominator
 * @returns {number | null}
 */
function rate(numerator, denominator) {
  if (typeof numerator !== 'number' || typeof denominator !== 'number') {
    return null;
  }
  if (!denominator) {
    return null;
  }
  return numerator / denominator;
}

/**
 * Step-to-step conversion for a funnel: each entry is the share of the
 * PREVIOUS step that reached this one. A step whose predecessor was zero is
 * null, not Infinity, and that includes the first step: "100% of nobody
 * entered the funnel" is a claim, and a false one.
 */
/** @param {number[]} steps @returns {Array<number | null>} */
function conversion(steps) {
  return steps.map((value, i) => {
    if (i === 0) {
      return value > 0 ? 1 : null;
    }
    return rate(value, steps[i - 1]);
  });
}

/**
 * Count, average and star histogram over reviews. Never averages nothing.
 * @param {Array<{rating?: number}> | null | undefined} reviews
 * @returns {{count: number, average: number | null, byStar: Record<number, number>}}
 */
function ratingTally(reviews) {
  const byStar = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0};
  let sum = 0;
  let count = 0;
  for (const review of reviews || []) {
    const stars = Number(review && review.rating);
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
      continue;
    }
    byStar[stars] += 1;
    sum += stars;
    count += 1;
  }
  return {count, average: count ? sum / count : null, byStar};
}

/**
 * Share of sessions that did not crash. Null with no sessions: an app nobody
 * opened is not an app with a perfect crash-free rate.
 */
/**
 * @param {number | null | undefined} sessions
 * @param {number | null | undefined} crashedSessions
 * @returns {number | null}
 */
function crashFreeRate(sessions, crashedSessions) {
  if (typeof sessions !== 'number' || !sessions) {
    return null;
  }
  if (typeof crashedSessions !== 'number' || crashedSessions < 0) {
    return null;
  }
  return Math.max(0, (sessions - crashedSessions) / sessions);
}

/**
 * The n biggest rows by a key, descending.
 * @template T
 * @param {T[] | null | undefined} rows
 * @param {(row: T) => number} key
 * @param {number} n
 * @returns {T[]}
 */
function topBy(rows, key, n) {
  return [...(rows || [])].sort((a, b) => key(b) - key(a)).slice(0, n);
}

module.exports = {delta, rate, conversion, ratingTally, crashFreeRate, topBy};
