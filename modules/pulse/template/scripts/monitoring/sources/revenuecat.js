'use strict';

/**
 * RevenueCat REST v2. The revenue source of truth, per the monetization
 * rules: Amplitude only ever sees the funnel.
 *
 * Two calls per run, deliberately. The Charts and Metrics domain is rate
 * limited to 25 requests a minute, and nothing here is worth spending that
 * budget on.
 *
 * Requires a SECRET key (v2 is Bearer, unlike v1) whose permissions include
 * `charts_metrics:overview:read`. A key without it answers 403, which is the
 * single most likely setup mistake, so it gets its own message.
 */

const {ok, unavailable, requireEnv, REQUIRED_ENV, isoDay} = require('../config');

const API = 'https://api.revenuecat.com/v2';

/** Overview metric ids, mapped to the names the report uses. */
const OVERVIEW_FIELDS = {
  active_subscriptions: 'activeSubscriptions',
  active_trials: 'activeTrials',
  mrr: 'mrr',
  revenue: 'revenue',
  new_customers: 'newCustomers',
  active_users: 'activeUsers',
  installs: 'installs',
};

async function rcGet(fetchImpl, key, url) {
  const response = await fetchImpl(url, {
    headers: {Authorization: `Bearer ${key}`, Accept: 'application/json'},
  });
  if (response.status === 403) {
    throw new Error(
      'RevenueCat HTTP 403: the secret key lacks the charts_metrics:overview:read permission ' +
        '(Project settings > API keys > edit permissions)',
    );
  }
  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json();
      detail = body && body.message ? `: ${body.message}` : '';
    } catch (e) {
      detail = '';
    }
    throw new Error(`RevenueCat HTTP ${response.status}${detail}`);
  }
  return response.json();
}

/**
 * The overview endpoint returns a flat list of {id, value} metrics. Map the
 * ones we name and keep the raw list, so a metric RevenueCat adds later is
 * still visible in the snapshot without a code change. A metric that is not
 * in the response is null, never 0.
 */
function shapeOverview(body) {
  const metrics = (body && body.metrics) || [];
  const shaped = {metrics};
  for (const name of Object.values(OVERVIEW_FIELDS)) {
    shaped[name] = null;
  }
  for (const metric of metrics) {
    const name = OVERVIEW_FIELDS[metric.id];
    if (name && typeof metric.value === 'number') {
      shaped[name] = metric.value;
    }
  }
  shaped.currency = (body && body.currency) || null;
  return shaped;
}

/**
 * @param {{env?: Record<string, string>, window: import('../config').Window,
 *          fetchImpl?: Function, execImpl?: Function}} context
 * @returns {Promise<import('../config').SourceResult>}
 */
async function fetchRevenueCat({env, window, fetchImpl}) {
  const fetcher = fetchImpl || fetch;
  const credentials = requireEnv(env || {}, REQUIRED_ENV.revenue);
  if (!credentials.ok) {
    return unavailable(credentials.reason);
  }

  const key = env.REVENUECAT_SECRET_KEY;
  const project = env.REVENUECAT_PROJECT_ID;

  let overview;
  try {
    overview = ok(shapeOverview(await rcGet(fetcher, key, `${API}/projects/${project}/metrics/overview`)));
  } catch (e) {
    // Overview is the block that proves the key works at all. If it failed,
    // the second call would fail for the same reason, so it is not attempted.
    return unavailable(e.message);
  }

  let revenue;
  try {
    // start_date and end_date, as YYYY-MM-DD. Epoch milliseconds are rejected
    // with "'1784073600000' is not a 'date'", and omitting either one is a
    // 400 naming the one you left out. Verified against the live API.
    const url =
      `${API}/projects/${project}/metrics/revenue` +
      `?start_date=${isoDay(window.since)}&end_date=${isoDay(window.until)}`;
    revenue = ok(await rcGet(fetcher, key, url));
  } catch (e) {
    revenue = unavailable(e.message);
  }

  return ok({overview, revenue});
}

module.exports = {fetchRevenueCat, shapeOverview};
