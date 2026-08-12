'use strict';

/**
 * Snapshot to one self-contained HTML page.
 *
 * Same honesty rule as render.js: an unavailable block is drawn as
 * unavailable with its reason, never as an empty chart, because an empty
 * chart is the most convincing zero there is.
 *
 * Constraints this file exists to satisfy:
 *   - No external host of ANY kind. A published artifact runs under a strict
 *     CSP: no CDN script, no web font, no remote image, no fetch.
 *   - Theme-aware in all three states. The palette is defined on bare :root,
 *     then overridden under prefers-color-scheme AND [data-theme], because
 *     the default "system" setting stamps no attribute at all.
 *   - Everything interpolated from an API is escaped. These strings come from
 *     Apple, Amplitude, RevenueCat and reader feedback, and none of them are
 *     ours to trust as markup.
 *   - No reader text. Review bodies and feedback notes stay in the snapshot.
 */

const {formatCount, formatPercent, formatMoney} = require('./render');

function esc(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function dataOf(block) {
  return block && block.status === 'ok' ? block.data : null;
}

function inner(source, name) {
  if (!source || source.status !== 'ok' || !source.data) {
    return null;
  }
  return source.data[name] || null;
}

/** The one place a non-ok state is turned into markup. */
function stateNote(block) {
  if (!block) {
    return '<p class="state">not run</p>';
  }
  if (block.status === 'unavailable') {
    return `<p class="state unavailable"><strong>unavailable</strong> ${esc(block.reason)}</p>`;
  }
  if (block.status === 'missing') {
    return '<p class="state">none in this window</p>';
  }
  return '';
}

function card(id, title, body) {
  return `<section class="card" data-card="${esc(id)}"><h2>${esc(title)}</h2>${body}</section>`;
}

function statRow(stats) {
  return `<div class="stats">${stats
    .map(
      ([label, value]) =>
        `<div class="stat"><span class="value">${esc(value)}</span><span class="label">${esc(label)}</span></div>`,
    )
    .join('')}</div>`;
}

/** A funnel as a stack of proportional bars. Inline SVG, no library. */
function funnelSvg(funnel) {
  const width = 520;
  const rowHeight = 34;
  const max = Math.max(...funnel.counts, 1);
  const rows = funnel.steps
    .map((step, i) => {
      const count = funnel.counts[i] || 0;
      const barWidth = Math.max(2, (count / max) * 300);
      const y = i * rowHeight;
      const rate = i > 0 ? ` (${formatPercent(funnel.conversion[i])})` : '';
      return (
        `<rect x="170" y="${y + 6}" width="${barWidth}" height="20" rx="4" fill="var(--accent)"></rect>` +
        `<text x="164" y="${y + 21}" text-anchor="end" class="axis">${esc(step)}</text>` +
        `<text x="${170 + barWidth + 8}" y="${y + 21}" class="axis">${esc(formatCount(count))}${esc(rate)}</text>`
      );
    })
    .join('');
  return `<svg viewBox="0 0 ${width} ${funnel.steps.length * rowHeight + 12}" role="img" aria-label="funnel">${rows}</svg>`;
}

function crashesCard(snapshot) {
  const source = snapshot.sources.crashes;
  const data = dataOf(source);
  if (!data) {
    return card('crashes', 'Crashes', stateNote(source));
  }
  const issues = (data.topIssues || [])
    .slice(0, 5)
    .map(
      issue =>
        `<li><span class="issue">${esc(issue.title)}</span><span class="muted">${esc(
          formatCount(issue.events),
        )} events, ${esc(formatCount(issue.users))} users${issue.version ? `, ${esc(issue.version)}` : ''}</span></li>`,
    )
    .join('');
  return card(
    'crashes',
    'Crashes',
    statRow([
      ['crash-free sessions', formatPercent(data.crashFreeRate)],
      ['crash events', formatCount(data.totalEvents)],
    ]) + (issues ? `<ul class="list">${issues}</ul>` : '<p class="state">no individual issues</p>'),
  );
}

function reviewsCard(snapshot) {
  const source = snapshot.sources.reviews;
  if (!source || source.status !== 'ok') {
    return card('reviews', 'Reviews and ratings', stateNote(source));
  }
  const ratings = dataOf(inner(source, 'ratings'));
  const reviewsBlock = inner(source, 'reviews');
  const reviews = dataOf(reviewsBlock);
  const releases = dataOf(inner(source, 'releases'));

  let body = '';
  if (ratings) {
    body += statRow([
      ['ratings', formatCount(ratings.totalRatings)],
      ['written reviews', reviews ? formatCount(reviews.tally.count) : '0'],
      ['store version', releases && releases.versions[0] ? releases.versions[0].version : 'not measured'],
    ]);
    body += `<ul class="list">${ratings.storefronts
      .map(
        store =>
          `<li><span>${esc(store.country.toUpperCase())}</span><span class="muted">${
            store.average === null ? 'no rating yet' : `${esc(store.average.toFixed(1))} stars`
          }, ${esc(formatCount(store.count))}</span></li>`,
      )
      .join('')}</ul>`;
  } else {
    body += stateNote(inner(source, 'ratings'));
  }
  if (!reviews) {
    body += stateNote(reviewsBlock);
  }
  return card('reviews', 'Reviews and ratings', body);
}

function productCard(snapshot) {
  const source = snapshot.sources.amplitude;
  if (!source || source.status !== 'ok') {
    return card('amplitude', 'Activation', stateNote(source));
  }
  const activation = dataOf(inner(source, 'activation'));
  const engagement = dataOf(inner(source, 'engagement'));
  let body = activation ? funnelSvg(activation) : stateNote(inner(source, 'activation'));
  if (engagement) {
    const neverSeen = new Set(engagement.neverSeen || []);
    body += `<ul class="list">${Object.entries(engagement.counts || {})
      .map(
        ([name, value]) =>
          `<li><span>${esc(name)}</span><span class="muted">${esc(formatCount(value))}${
            neverSeen.has(name) ? ' (never received)' : ''
          }</span></li>`,
      )
      .join('')}</ul>`;
  }
  return card('amplitude', 'Activation', body);
}

function moneyCard(snapshot) {
  const revenue = snapshot.sources.revenue;
  const amplitude = snapshot.sources.amplitude;
  const overview = dataOf(inner(revenue, 'overview'));
  const monetization = dataOf(inner(amplitude, 'monetization'));

  let body = '';
  if (overview) {
    body += statRow([
      ['MRR', formatMoney(overview.mrr, overview.currency)],
      ['subscriptions', `${formatCount(overview.activeSubscriptions)} active`],
      ['trials', `${formatCount(overview.activeTrials)} active`],
    ]);
  } else {
    body += stateNote(revenue && revenue.status === 'ok' ? inner(revenue, 'overview') : revenue);
  }
  body += monetization ? funnelSvg(monetization) : stateNote(inner(amplitude, 'monetization'));
  return card('revenue', 'Revenue', body);
}

function backendCard(snapshot) {
  const source = snapshot.sources.supabase;
  if (!source || source.status !== 'ok') {
    return card('supabase', 'Accounts and backend', stateNote(source));
  }
  const accounts = dataOf(inner(source, 'accounts'));
  const sync = dataOf(inner(source, 'sync'));
  const feedbackBlock = inner(source, 'feedback');
  const feedback = dataOf(feedbackBlock);

  let body = statRow([
    ['accounts', accounts ? formatCount(accounts.total) : 'not measured'],
    ['new this window', accounts ? formatCount(accounts.newInWindow) : 'not measured'],
    ['synced rows', sync ? formatCount(sync.rows) : 'not measured'],
  ]);
  if (feedback) {
    // Counts only. The notes are reader text and stay in the snapshot.
    body += `<p class="state">${esc(formatCount(feedback.count))} in-app feedback notes (${esc(
      Object.entries(feedback.byVersion || {})
        .map(([version, count]) => `${version} x${count}`)
        .join(', '),
    )}). Text is in the snapshot.</p>`;
  } else {
    body += stateNote(feedbackBlock);
  }
  const errors = inner(source, 'functionErrors');
  if (errors && errors.status !== 'ok') {
    body += stateNote(errors);
  }
  return card('supabase', 'Accounts and backend', body);
}

function blindSpots(snapshot) {
  const blind = [];
  for (const [id, source] of Object.entries(snapshot.sources)) {
    if (source.status === 'unavailable') {
      blind.push([id, source.reason]);
    } else if (source.status === 'ok' && source.data) {
      for (const [name, block] of Object.entries(source.data)) {
        if (block && block.status === 'unavailable') {
          blind.push([`${id}.${name}`, block.reason]);
        }
      }
    }
  }
  if (!blind.length) {
    return '';
  }
  return card(
    'blind-spots',
    'Could not be reached',
    `<ul class="list">${blind
      .map(([id, reason]) => `<li><span>${esc(id)}</span><span class="muted">${esc(reason)}</span></li>`)
      .join('')}</ul>`,
  );
}

const STYLE = `
:root {
  --bg: #faf8f4;
  --surface: #ffffff;
  --border: #e6e0d6;
  --text: #1c1a17;
  --muted: #6b6459;
  --accent: #8a6f45;
  --warn: #a3441f;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #14120f;
    --surface: #1d1a16;
    --border: #322c25;
    --text: #f2eee7;
    --muted: #a09889;
    --accent: #c9a86a;
    --warn: #e08663;
  }
}
:root[data-theme="dark"] {
  --bg: #14120f;
  --surface: #1d1a16;
  --border: #322c25;
  --text: #f2eee7;
  --muted: #a09889;
  --accent: #c9a86a;
  --warn: #e08663;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 32px 20px 64px;
  background: var(--bg);
  color: var(--text);
  font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}
.wrap { max-width: 1100px; margin: 0 auto; }
header { margin-bottom: 28px; }
h1 { font-size: 26px; margin: 0 0 6px; letter-spacing: -0.01em; }
.sub { color: var(--muted); margin: 0; }
.grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); }
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 18px 20px;
  overflow-x: auto;
}
.card h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin: 0 0 14px; }
.stats { display: flex; flex-wrap: wrap; gap: 22px; margin-bottom: 12px; }
.stat { display: flex; flex-direction: column; }
.stat .value { font-size: 24px; font-weight: 600; letter-spacing: -0.01em; }
.stat .label { font-size: 12px; color: var(--muted); }
.list { list-style: none; margin: 10px 0 0; padding: 0; }
.list li { display: flex; justify-content: space-between; gap: 16px; padding: 6px 0; border-top: 1px solid var(--border); }
.list .muted, .muted { color: var(--muted); font-variant-numeric: tabular-nums; }
.issue { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; }
.state { color: var(--muted); margin: 8px 0 0; font-size: 14px; }
.state.unavailable { color: var(--warn); }
.state.unavailable strong { text-transform: uppercase; font-size: 12px; letter-spacing: 0.06em; }
svg { max-width: 100%; height: auto; display: block; margin-top: 6px; }
.axis { fill: var(--muted); font-size: 12px; }
`;

function renderDashboard(snapshot, previous) {
  const day = String(snapshot.generatedAt).slice(0, 10);
  const cards = [
    crashesCard(snapshot),
    reviewsCard(snapshot),
    productCard(snapshot),
    moneyCard(snapshot),
    backendCard(snapshot),
    blindSpots(snapshot),
  ]
    .filter(Boolean)
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DailyBook pulse, ${esc(day)}</title>
<style>${STYLE}</style>
</head>
<body>
<div class="wrap">
<header>
<h1>DailyBook pulse</h1>
<p class="sub">${esc(day)}. Window: ${esc(snapshot.window.days)} days, ${esc(
    String(snapshot.window.since).slice(0, 10),
  )} to ${esc(String(snapshot.window.until).slice(0, 10))}.${
    previous ? ` Compared with ${esc(String(previous.generatedAt).slice(0, 10))}.` : ''
  }</p>
</header>
<div class="grid">
${cards}
</div>
</div>
</body>
</html>
`;
}

module.exports = {renderDashboard, esc};
