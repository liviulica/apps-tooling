/**
 * The dashboard is the same snapshot, drawn. It must obey the same honesty
 * rule as the markdown report, and it must survive a strict CSP with no
 * external host of any kind.
 */
import {renderDashboard} from '../scripts/monitoring/dashboard';
import {ok, missing, unavailable} from '../scripts/monitoring/config';

const SNAPSHOT = {
  version: 1,
  generatedAt: '2026-08-12T09:00:00.000Z',
  window: {days: 7, since: '2026-08-05T09:00:00.000Z', until: '2026-08-12T09:00:00.000Z'},
  previousDate: null,
  sources: {
    crashes: unavailable('Firebase MCP server not connected'),
    reviews: ok({
      ratings: ok({storefronts: [{country: 'us', average: 4.5, count: 12}], totalRatings: 12}),
      reviews: missing('none'),
      sales: unavailable('no vendor number'),
      releases: ok({versions: [{version: '1.5.0', state: 'READY_FOR_SALE'}], builds: []}),
    }),
    amplitude: ok({
      activation: ok({steps: ['App Opened', 'Book Opened'], counts: [100, 40], conversion: [1, 0.4]}),
      monetization: ok({
        steps: ['Paywall Viewed', 'Purchase Completed'],
        counts: [20, 1],
        conversion: [1, 0.05],
      }),
      engagement: ok({counts: {'Book Finished': 12, 'Notebook Opened': 0}, neverSeen: ['Notebook Opened']}),
      health: ok({counts: {'Sync Retried': 2}, neverSeen: []}),
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
        notes: [{message: 'a reader complaint that must not be published', app_version: '1.4.10', platform: 'ios'}],
        byPlatform: {ios: 2},
        byVersion: {'1.4.10': 2},
      }),
      submissions: missing('none'),
      functionErrors: unavailable('needs a management token'),
    }),
  },
};

const html = renderDashboard(SNAPSHOT, null);

describe('self-containment', () => {
  it('references no external host, because a strict CSP blocks every one', () => {
    expect(html).not.toMatch(/src=["']https?:/);
    expect(html).not.toMatch(/href=["']https?:/);
    expect(html).not.toContain('cdn.');
    expect(html).not.toMatch(/@import\s+url/);
    expect(html).not.toContain('fetch(');
  });

  it('carries a title', () => {
    expect(html).toMatch(/<title>[^<]+<\/title>/);
  });

  it('draws its charts as inline SVG rather than a library', () => {
    expect(html).toContain('<svg');
    expect(html).not.toContain('<script src');
  });
});

describe('theming', () => {
  it('defines the full palette on bare :root, so a system-default viewer is not left blank', () => {
    const root = html.slice(html.indexOf(':root {'), html.indexOf('}', html.indexOf(':root {')));
    expect(root).toContain('--bg');
    expect(root).toContain('--text');
  });

  it('overrides for dark in both the media query and the explicit attribute', () => {
    expect(html).toContain('prefers-color-scheme: dark');
    expect(html).toContain('[data-theme="dark"]');
    expect(html).toContain('[data-theme="light"]');
  });

  it('paints the body background explicitly, so it does not borrow the host theme', () => {
    expect(html).toMatch(/body\s*\{[^}]*background/);
  });
});

describe('honesty', () => {
  it('draws an unavailable source as unavailable, not as an empty chart', () => {
    const card = html.slice(html.indexOf('data-card="crashes"'));
    const end = card.indexOf('</section>');
    expect(card.slice(0, end)).toContain('unavailable');
    expect(card.slice(0, end)).toContain('Firebase MCP server not connected');
  });

  it('marks a missing block as none in this window', () => {
    expect(html).toContain('none in this window');
  });

  it('never publishes reader text', () => {
    expect(html).not.toContain('a reader complaint that must not be published');
  });

  it('escapes text that came from an API rather than injecting it as markup', () => {
    const hostile = {
      ...SNAPSHOT,
      sources: {crashes: unavailable('<img src=x onerror="alert(1)">')},
    };
    const out = renderDashboard(hostile, null);
    expect(out).not.toContain('<img src=x');
    expect(out).toContain('&lt;img');
  });
});

describe('content', () => {
  it('shows the headline numbers', () => {
    expect(html).toContain('41.93');
    expect(html).toContain('1.5.0');
  });

  it('shows both funnels', () => {
    expect(html).toContain('Paywall Viewed');
    expect(html).toContain('App Opened');
  });

  it('lists per-event totals and marks the ones Amplitude has never received', () => {
    expect(html).toContain('Book Finished');
    expect(html).toContain('never received');
  });
});
