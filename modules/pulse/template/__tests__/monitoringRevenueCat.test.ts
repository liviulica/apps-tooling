/**
 * RevenueCat is the revenue source of truth. Amplitude only sees the funnel,
 * and App Store sales reports lag by a day, so a wrong number here is the one
 * that would actually mislead a decision.
 */
import {fetchRevenueCat} from '../scripts/monitoring/sources/revenuecat';

const WINDOW = {
  days: 7,
  since: new Date('2026-08-05T00:00:00Z'),
  until: new Date('2026-08-12T00:00:00Z'),
};

const ENV = {REVENUECAT_SECRET_KEY: 'sk_test_123', REVENUECAT_PROJECT_ID: 'proj_abc'};

const OVERVIEW = {
  object: 'overview_metrics',
  metrics: [
    {id: 'active_subscriptions', name: 'Active Subscriptions', unit: '#', value: 7},
    {id: 'active_trials', name: 'Active Trials', unit: '#', value: 3},
    {id: 'mrr', name: 'MRR', unit: '$', value: 41.93},
    {id: 'revenue', name: 'Revenue', unit: '$', period: 'P28D', value: 118.5},
    {id: 'new_customers', name: 'New Customers', unit: '#', value: 22},
  ],
};

function fakeFetch(responder: (url: string) => {status?: number; body?: unknown}) {
  const calls: Array<{url: string; headers: Record<string, string>}> = [];
  const impl = async (url: string, init: {headers?: Record<string, string>} = {}) => {
    calls.push({url, headers: init.headers || {}});
    const {status = 200, body = {}} = responder(url);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  };
  return {impl, calls};
}

describe('fetchRevenueCat credentials', () => {
  it('is unavailable and names the variable when the secret key is absent', async () => {
    const {impl} = fakeFetch(() => ({body: OVERVIEW}));
    const result = await fetchRevenueCat({env: {}, window: WINDOW, fetchImpl: impl});
    expect(result.status).toBe('unavailable');
    expect(result.reason).toContain('REVENUECAT_SECRET_KEY');
    expect(result.data).toBeUndefined();
  });

  it('sends the secret key as a bearer token, which v2 requires', async () => {
    const {impl, calls} = fakeFetch(() => ({body: OVERVIEW}));
    await fetchRevenueCat({env: ENV, window: WINDOW, fetchImpl: impl});
    expect(calls[0].headers.Authorization).toBe('Bearer sk_test_123');
  });

  it('explains a 403 as the missing chart permission rather than as no revenue', async () => {
    const {impl} = fakeFetch(() => ({status: 403, body: {message: 'insufficient permissions'}}));
    const result = await fetchRevenueCat({env: ENV, window: WINDOW, fetchImpl: impl});
    expect(result.status).toBe('unavailable');
    expect(result.reason).toContain('charts_metrics:overview:read');
  });

  it('reads a 401 as unavailable, never as zero subscribers', async () => {
    const {impl} = fakeFetch(() => ({status: 401, body: {}}));
    const result = await fetchRevenueCat({env: ENV, window: WINDOW, fetchImpl: impl});
    expect(result.status).toBe('unavailable');
    expect(result.reason).toContain('401');
  });
});

describe('fetchRevenueCat overview', () => {
  it('maps the metric list into named fields and keeps the raw list', async () => {
    const {impl} = fakeFetch(url =>
      url.includes('/overview') ? {body: OVERVIEW} : {status: 404, body: {}},
    );
    const result = await fetchRevenueCat({env: ENV, window: WINDOW, fetchImpl: impl});
    expect(result.status).toBe('ok');
    expect(result.data.overview.status).toBe('ok');
    expect(result.data.overview.data).toMatchObject({
      activeSubscriptions: 7,
      activeTrials: 3,
      mrr: 41.93,
      revenue: 118.5,
      newCustomers: 22,
    });
    expect(result.data.overview.data.metrics).toHaveLength(5);
  });

  it('leaves a metric RevenueCat did not send as null rather than zero', async () => {
    const {impl} = fakeFetch(() => ({body: {metrics: [{id: 'mrr', value: 10}]}}));
    const result = await fetchRevenueCat({env: ENV, window: WINDOW, fetchImpl: impl});
    expect(result.data.overview.data.mrr).toBe(10);
    expect(result.data.overview.data.activeSubscriptions).toBeNull();
  });

  it('asks for revenue with the date parameters the API actually requires', async () => {
    // Verified against the live API on 2026-08-12: start_date and end_date as
    // YYYY-MM-DD. Epoch milliseconds come back as "is not a 'date'", and
    // omitting either is a 400 naming the missing one. The first version sent
    // starts_at/ends_at in epoch ms and 400'd on every run.
    const {impl, calls} = fakeFetch(() => ({body: OVERVIEW}));
    await fetchRevenueCat({env: ENV, window: WINDOW, fetchImpl: impl});
    const revenueCall = calls.find(c => c.url.includes('/metrics/revenue'));
    expect(revenueCall).toBeDefined();
    expect(revenueCall!.url).toContain('start_date=2026-08-05');
    expect(revenueCall!.url).toContain('end_date=2026-08-12');
    expect(revenueCall!.url).not.toContain('starts_at');
  });

  it('stays within two requests, because the charts domain allows 25 a minute', async () => {
    const {impl, calls} = fakeFetch(() => ({body: OVERVIEW}));
    await fetchRevenueCat({env: ENV, window: WINDOW, fetchImpl: impl});
    expect(calls.length).toBeLessThanOrEqual(2);
  });

  it('survives the revenue block failing on its own', async () => {
    const {impl} = fakeFetch(url =>
      url.includes('/revenue') ? {status: 400, body: {message: 'bad range'}} : {body: OVERVIEW},
    );
    const result = await fetchRevenueCat({env: ENV, window: WINDOW, fetchImpl: impl});
    expect(result.status).toBe('ok');
    expect(result.data.overview.status).toBe('ok');
    expect(result.data.revenue.status).toBe('unavailable');
  });
});
