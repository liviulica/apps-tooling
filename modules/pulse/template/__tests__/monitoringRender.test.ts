/**
 * The renderer is where a monitoring tool tells its lies. Every test here is
 * about the difference between "nothing happened" and "we could not look".
 */
import {renderReport, formatCount, formatPercent} from '../scripts/monitoring/render';
import {ok, missing, unavailable} from '../scripts/monitoring/config';

function snapshot(sources: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return {
    version: 1,
    generatedAt: '2026-08-12T09:00:00.000Z',
    window: {days: 7, since: '2026-08-05T09:00:00.000Z', until: '2026-08-12T09:00:00.000Z'},
    previousDate: null,
    sources,
    ...extra,
  };
}

const FULL = snapshot({
  crashes: ok({
    crashFreeRate: 0.994,
    totalEvents: 6,
    topIssues: [{title: 'RangeError: invalid array length', events: 4, users: 3, version: '1.5.0'}],
  }),
  reviews: ok({
    reviews: ok({
      reviews: [
        {id: 'r1', rating: 5, title: 'Lovely', body: 'A calm place to read.', territory: 'USA', createdDate: '2026-08-10T00:00:00Z'},
      ],
      tally: {count: 1, average: 5, byStar: {1: 0, 2: 0, 3: 0, 4: 0, 5: 1}},
    }),
    ratings: ok({storefronts: [{country: 'us', average: 4.5, count: 12}], totalRatings: 12}),
    sales: ok({units: 40, proceeds: 12.5, currency: 'EUR', daysCovered: 7}),
    releases: ok({versions: [{version: '1.5.0', state: 'READY_FOR_SALE'}], builds: []}),
  }),
  amplitude: ok({
    activation: ok({
      steps: ['App Opened', 'Book Opened'],
      counts: [100, 40],
      conversion: [1, 0.4],
    }),
    monetization: ok({
      steps: ['Paywall Viewed', 'Purchase Completed'],
      counts: [20, 1],
      conversion: [1, 0.05],
    }),
    engagement: ok({counts: {'Book Finished': 12}, neverSeen: []}),
    health: ok({counts: {'Sync Retried': 2, 'Film Playback Failed': 0}, neverSeen: ['Film Playback Failed']}),
  }),
  revenue: ok({
    overview: ok({activeSubscriptions: 7, activeTrials: 3, mrr: 41.93, revenue: 118.5, currency: 'EUR'}),
    revenue: ok({}),
  }),
  supabase: ok({
    accounts: ok({total: 9, newInWindow: 7}),
    sync: ok({rows: 30, updatedInWindow: 29}),
    feedback: ok({
      count: 2,
      notes: [{message: 'the reader skips pages on my phone', app_version: '1.4.10', platform: 'ios'}],
      byPlatform: {ios: 2},
      byVersion: {'1.4.10': 2},
    }),
    submissions: missing('none'),
    functionErrors: unavailable('needs SUPABASE_ACCESS_TOKEN'),
  }),
});

describe('an unavailable source', () => {
  const report = renderReport(
    snapshot({
      crashes: unavailable('Firebase MCP server not configured'),
      revenue: unavailable('not configured: REVENUECAT_SECRET_KEY missing'),
    }),
    null,
  );

  /** The section itself, not the whole report: the footer lists blind spots too. */
  function section(title: string): string {
    const start = report.indexOf(`## ${title}`);
    const next = report.indexOf('\n## ', start + 1);
    return report.slice(start, next === -1 ? undefined : next);
  }

  it('says unavailable IN ITS OWN SECTION and gives the reason there', () => {
    expect(section('Crashes')).toContain('unavailable');
    expect(section('Crashes')).toContain('Firebase MCP server not configured');
    expect(section('Revenue')).toContain('unavailable');
    expect(section('Revenue')).toContain('REVENUECAT_SECRET_KEY');
  });

  it('prints no measurement of any kind in that section', () => {
    // Not "0", and not "not measured" either: a row of dashes where numbers
    // belong still reads as a report that looked and found nothing.
    expect(section('Crashes')).not.toMatch(/\b0\b/);
    expect(section('Crashes')).not.toContain('Crash-free sessions');
    expect(section('Crashes')).not.toContain('not measured');
  });

  it('is listed again at the end, so a half-blind run cannot read as a full one', () => {
    expect(report).toContain('Could not be reached');
    expect(report.slice(report.indexOf('Could not be reached'))).toContain('crashes');
    expect(report.slice(report.indexOf('Could not be reached'))).toContain('revenue');
  });
});

describe('a missing source', () => {
  it('says none in this window, which is a real answer and not a failure', () => {
    const report = renderReport(snapshot({crashes: missing('Crashlytics reported no issues')}), null);
    expect(report).toContain('none in this window');
    expect(report).not.toContain('Could not be reached');
  });
});

describe('a full report', () => {
  const report = renderReport(FULL, null);

  it('leads with the window and the date', () => {
    expect(report).toContain('2026-08-12');
    expect(report).toContain('7 days');
  });

  it('names the top crash and the crash-free rate', () => {
    expect(report).toContain('RangeError: invalid array length');
    expect(report).toContain('99.4%');
  });

  it('reports ratings and reviews as separate things, because the API hides star-only ratings', () => {
    expect(report).toContain('12 ratings');
    expect(report).toContain('1 review');
  });

  it('reports the paywall conversion rate', () => {
    expect(report).toContain('5.0%');
  });

  it('prints the per-event totals', () => {
    expect(report).toContain('Book Finished: 12');
    expect(report).toContain('Sync Retried: 2');
  });

  it('flags a zero Amplitude has never seen, because that is a finding and not a count', () => {
    expect(report).toContain('Film Playback Failed: 0 (Amplitude has never received this event)');
    expect(report).not.toContain('Sync Retried: 2 (Amplitude has never received');
  });

  it('reports revenue and subscriptions', () => {
    expect(report).toContain('41.93');
    expect(report).toContain('7 active');
  });

  it('counts feedback without pasting reader text into a committed file', () => {
    expect(report).toContain('2 notes');
    expect(report).not.toContain('the reader skips pages on my phone');
  });

  it('uses no em dashes, per the design system', () => {
    expect(report).not.toContain('—');
  });
});

describe('deltas', () => {
  const previous = snapshot({
    revenue: ok({overview: ok({activeSubscriptions: 4, mrr: 20, activeTrials: 1}), revenue: ok({})}),
    supabase: ok({accounts: ok({total: 5, newInWindow: 2})}),
  });

  it('compares against the previous snapshot', () => {
    const report = renderReport(FULL, previous);
    expect(report).toMatch(/\+3/);
  });

  it('suppresses the comparison when the previous run could not answer that source', () => {
    const blindPrevious = snapshot({revenue: unavailable('was not configured yet')});
    const report = renderReport(FULL, blindPrevious);
    const revenueSection = report.slice(report.indexOf('## Revenue'));
    expect(revenueSection).not.toMatch(/[+-]\d+ since/);
  });
});

describe('formatters', () => {
  it('prints a null count as a dash, never as zero', () => {
    expect(formatCount(null)).toBe('not measured');
    expect(formatCount(0)).toBe('0');
    expect(formatCount(1200)).toBe('1,200');
  });

  it('prints a null percentage as not measured', () => {
    expect(formatPercent(null)).toBe('not measured');
    expect(formatPercent(0.05)).toBe('5.0%');
  });
});
