'use strict';

/**
 * Snapshot to markdown.
 *
 * The renderer is where a monitoring tool lies. Three rules hold it honest:
 *
 *   1. An `unavailable` block prints the word unavailable and its reason, and
 *      never a number. Not a zero, not a dash that could be read as zero.
 *   2. A `missing` block prints "none in this window", because that IS an
 *      answer and should not look like a failure.
 *   3. A delta is only drawn when BOTH runs answered. Comparing against a
 *      blind previous run invents a trend.
 *
 * Every unavailable source is also listed once more at the end, so a report
 * from a half-blind run cannot be skimmed as a full one.
 *
 * Reader text (review bodies, feedback notes) is deliberately NOT printed:
 * reports are committed, snapshots are not. Counts here, content there.
 */

const {delta} = require('./metrics');

const UNMEASURED = 'not measured';

function formatCount(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return UNMEASURED;
  }
  return value.toLocaleString('en-US');
}

function formatPercent(value, digits = 1) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return UNMEASURED;
  }
  return `${(value * 100).toFixed(digits)}%`;
}

function formatMoney(value, currency) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return UNMEASURED;
  }
  return `${value.toFixed(2)}${currency ? ` ${currency}` : ''}`;
}

/** "+3 since 2026-08-05", or nothing at all when either side is blind. */
function deltaNote(current, previous, previousDate) {
  const d = delta(current, previous);
  if (!d || d.change === 0) {
    return '';
  }
  const sign = d.change > 0 ? '+' : '';
  return ` (${sign}${formatCount(d.change)} since ${previousDate || 'the previous run'})`;
}

/** Pull a nested block out of a source, tolerating every failure shape. */
function block(source, name) {
  if (!source || source.status !== 'ok' || !source.data) {
    return null;
  }
  return source.data[name] || null;
}

function dataOf(b) {
  return b && b.status === 'ok' ? b.data : null;
}

function statusLine(thing, source) {
  if (!source) {
    return `${thing} was not run.`;
  }
  if (source.status === 'unavailable') {
    return `${thing} is **unavailable**: ${source.reason}`;
  }
  if (source.status === 'missing') {
    return `${thing}: none in this window.`;
  }
  return null;
}

function renderCrashes(snapshot, previous) {
  const lines = ['## Crashes'];
  const source = snapshot.sources.crashes;
  const short = statusLine('Crashlytics', source);
  if (short) {
    lines.push('', short);
    return lines.join('\n');
  }

  const d = source.data || {};
  const previousRate = dataOf(previous && previous.sources && previous.sources.crashes)
    ? previous.sources.crashes.data.crashFreeRate
    : null;
  lines.push('');
  lines.push(`- Crash-free sessions: ${formatPercent(d.crashFreeRate)}${
    delta(d.crashFreeRate, previousRate) ? '' : ''
  }`);
  lines.push(`- Crash events: ${formatCount(d.totalEvents)}`);
  if (d.topIssues && d.topIssues.length) {
    lines.push('');
    lines.push('Top issues:');
    for (const issue of d.topIssues.slice(0, 5)) {
      lines.push(
        `- **${issue.title}** ${formatCount(issue.events)} events, ${formatCount(issue.users)} users` +
          `${issue.version ? `, ${issue.version}` : ''}`,
      );
    }
  } else {
    lines.push('- No individual issues reported.');
  }
  return lines.join('\n');
}

function renderReviews(snapshot) {
  const lines = ['## Reviews and ratings'];
  const source = snapshot.sources.reviews;
  const short = statusLine('App Store Connect', source);
  if (short) {
    lines.push('', short);
    return lines.join('\n');
  }

  lines.push('');
  const ratings = dataOf(block(source, 'ratings'));
  if (ratings) {
    lines.push(`- ${formatCount(ratings.totalRatings)} ratings across storefronts:`);
    for (const store of ratings.storefronts) {
      lines.push(
        `  - ${store.country.toUpperCase()}: ${
          store.average === null ? 'no rating yet' : `${store.average.toFixed(1)} stars`
        }, ${formatCount(store.count)} ratings`,
      );
    }
  } else {
    lines.push(`- Star ratings are **unavailable**: ${(block(source, 'ratings') || {}).reason}`);
  }

  const reviewBlock = block(source, 'reviews');
  const reviews = dataOf(reviewBlock);
  if (reviews) {
    const {tally} = reviews;
    lines.push(
      `- ${formatCount(tally.count)} ${tally.count === 1 ? 'review' : 'reviews'} with text, ` +
        `averaging ${tally.average === null ? UNMEASURED : tally.average.toFixed(1)} stars.`,
    );
    for (const review of reviews.reviews.slice(0, 5)) {
      lines.push(
        `  - ${review.rating}star "${review.title}" (${review.territory}, ${String(review.createdDate).slice(0, 10)})`,
      );
    }
    lines.push('  Review text is in the snapshot, not here.');
  } else if (reviewBlock && reviewBlock.status === 'missing') {
    lines.push('- Written reviews: none in this window.');
  } else if (reviewBlock) {
    lines.push(`- Written reviews are **unavailable**: ${reviewBlock.reason}`);
  }

  const sales = dataOf(block(source, 'sales'));
  if (sales) {
    lines.push(
      `- Sales: ${formatCount(sales.units)} units, ${formatMoney(sales.proceeds, sales.currency)} proceeds ` +
        `over ${sales.daysCovered} days.`,
    );
  } else if (block(source, 'sales')) {
    lines.push(`- Sales are **unavailable**: ${block(source, 'sales').reason}`);
  }

  const releases = dataOf(block(source, 'releases'));
  if (releases && releases.versions.length) {
    const live = releases.versions[0];
    lines.push(`- Store version: ${live.version} (${live.state}).`);
  }

  return lines.join('\n');
}

/**
 * A zero that Amplitude has never seen is worth flagging: the event exists in
 * the code but has never once arrived, so either nobody hits that path or the
 * instrumentation is not wired up. Both are findings.
 */
function eventLines(eventBlock) {
  const neverSeen = new Set(eventBlock.neverSeen || []);
  return Object.entries(eventBlock.counts || {}).map(
    ([name, value]) =>
      `- ${name}: ${formatCount(value)}` +
      (neverSeen.has(name) ? ' (Amplitude has never received this event)' : ''),
  );
}

function renderProduct(snapshot) {
  const lines = ['## Activation and engagement'];
  const source = snapshot.sources.amplitude;
  const short = statusLine('Amplitude', source);
  if (short) {
    lines.push('', short);
    return lines.join('\n');
  }

  lines.push('');
  const activation = dataOf(block(source, 'activation'));
  if (activation) {
    activation.steps.forEach((step, i) => {
      lines.push(
        `- ${step}: ${formatCount(activation.counts[i])}` +
          (i > 0 ? ` (${formatPercent(activation.conversion[i])} of the step before)` : ''),
      );
    });
  } else {
    lines.push(`- The activation funnel is **unavailable**: ${(block(source, 'activation') || {}).reason}`);
  }

  const engagement = dataOf(block(source, 'engagement'));
  if (engagement) {
    lines.push('');
    lines.push('Reading:');
    lines.push(...eventLines(engagement));
  }

  const health = dataOf(block(source, 'health'));
  if (health) {
    lines.push('');
    lines.push('Things that should be rare:');
    lines.push(...eventLines(health));
  }

  return lines.join('\n');
}

function renderMoney(snapshot, previous) {
  const lines = ['## Revenue'];
  const amplitude = snapshot.sources.amplitude;
  const monetization = dataOf(block(amplitude, 'monetization'));
  if (monetization) {
    lines.push('');
    lines.push('Paywall funnel:');
    monetization.steps.forEach((step, i) => {
      lines.push(
        `- ${step}: ${formatCount(monetization.counts[i])}` +
          (i > 0 ? ` (${formatPercent(monetization.conversion[i])} of the step before)` : ''),
      );
    });
  }

  const source = snapshot.sources.revenue;
  const short = statusLine('RevenueCat', source);
  if (short) {
    lines.push('', short);
    return lines.join('\n');
  }

  const overview = dataOf(block(source, 'overview'));
  const previousOverview = dataOf(block(previous && previous.sources && previous.sources.revenue, 'overview'));
  const previousDate = previous ? String(previous.generatedAt).slice(0, 10) : null;
  lines.push('');
  if (overview) {
    lines.push(
      `- Subscriptions: ${formatCount(overview.activeSubscriptions)} active` +
        deltaNote(
          overview.activeSubscriptions,
          previousOverview ? previousOverview.activeSubscriptions : null,
          previousDate,
        ),
    );
    lines.push(`- Trials: ${formatCount(overview.activeTrials)} active`);
    lines.push(
      `- MRR: ${formatMoney(overview.mrr, overview.currency)}` +
        deltaNote(overview.mrr, previousOverview ? previousOverview.mrr : null, previousDate),
    );
    lines.push(`- Revenue in RevenueCat's window: ${formatMoney(overview.revenue, overview.currency)}`);
  } else {
    lines.push(`- The overview is **unavailable**: ${(block(source, 'overview') || {}).reason}`);
  }
  return lines.join('\n');
}

function renderBackend(snapshot, previous) {
  const lines = ['## Accounts and backend'];
  const source = snapshot.sources.supabase;
  const short = statusLine('Supabase', source);
  if (short) {
    lines.push('', short);
    return lines.join('\n');
  }

  const previousDate = previous ? String(previous.generatedAt).slice(0, 10) : null;
  const accounts = dataOf(block(source, 'accounts'));
  const previousAccounts = dataOf(block(previous && previous.sources && previous.sources.supabase, 'accounts'));
  lines.push('');
  if (accounts) {
    lines.push(
      `- Accounts: ${formatCount(accounts.total)} total` +
        deltaNote(accounts.total, previousAccounts ? previousAccounts.total : null, previousDate),
    );
    lines.push(`- New in this window: ${formatCount(accounts.newInWindow)}`);
  }

  const sync = dataOf(block(source, 'sync'));
  if (sync) {
    lines.push(`- Synced rows: ${formatCount(sync.rows)}, ${formatCount(sync.updatedInWindow)} touched in the window.`);
  }

  const feedbackBlock = block(source, 'feedback');
  const feedback = dataOf(feedbackBlock);
  if (feedback) {
    const versions = Object.entries(feedback.byVersion || {})
      .map(([version, count]) => `${version} x${count}`)
      .join(', ');
    lines.push(
      `- In-app feedback: ${formatCount(feedback.count)} notes${versions ? ` (${versions})` : ''}. ` +
        'The text is in the snapshot, not here.',
    );
  } else if (feedbackBlock && feedbackBlock.status === 'missing') {
    lines.push('- In-app feedback: none in this window.');
  } else if (feedbackBlock) {
    lines.push(`- In-app feedback is **unavailable**: ${feedbackBlock.reason}`);
  }

  const errors = block(source, 'functionErrors');
  if (errors && errors.status === 'unavailable') {
    lines.push(`- Edge function errors are **unavailable**: ${errors.reason}`);
  } else if (errors && errors.status === 'missing') {
    lines.push('- Edge function 5xx: none in this window.');
  } else if (dataOf(errors)) {
    for (const row of dataOf(errors).rows) {
      lines.push(`- ${row.function_id}: ${formatCount(row.errors)} errors`);
    }
  }

  return lines.join('\n');
}

/**
 * Every source and nested block that could not answer, gathered once more.
 * A report that quietly covered three of five sources is worse than no
 * report, because it reads as an all-clear.
 */
function renderBlindSpots(snapshot) {
  const blind = [];
  for (const [id, source] of Object.entries(snapshot.sources)) {
    if (source.status === 'unavailable') {
      blind.push(`- **${id}**: ${source.reason}`);
      continue;
    }
    if (source.status === 'ok' && source.data) {
      for (const [name, inner] of Object.entries(source.data)) {
        if (inner && inner.status === 'unavailable') {
          blind.push(`- **${id}.${name}**: ${inner.reason}`);
        }
      }
    }
  }
  if (!blind.length) {
    return '';
  }
  return ['## Could not be reached', '', ...blind].join('\n');
}

function renderReport(snapshot, previous) {
  const day = String(snapshot.generatedAt).slice(0, 10);
  const sections = [
    `# DailyBook pulse, ${day}`,
    '',
    `Window: ${snapshot.window.days} days, ${String(snapshot.window.since).slice(0, 10)} to ${String(
      snapshot.window.until,
    ).slice(0, 10)}.` + (previous ? ` Compared with ${String(previous.generatedAt).slice(0, 10)}.` : ''),
    '',
  ];

  if (snapshot.sources.crashes) {
    sections.push(renderCrashes(snapshot, previous), '');
  }
  if (snapshot.sources.reviews) {
    sections.push(renderReviews(snapshot), '');
  }
  if (snapshot.sources.amplitude) {
    sections.push(renderProduct(snapshot), '');
  }
  if (snapshot.sources.revenue || snapshot.sources.amplitude) {
    sections.push(renderMoney(snapshot, previous), '');
  }
  if (snapshot.sources.supabase) {
    sections.push(renderBackend(snapshot, previous), '');
  }

  const blind = renderBlindSpots(snapshot);
  if (blind) {
    sections.push(blind, '');
  }

  return sections.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

module.exports = {renderReport, formatCount, formatPercent, formatMoney, renderBlindSpots};
