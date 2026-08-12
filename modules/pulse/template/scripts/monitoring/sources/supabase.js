'use strict';

/**
 * Supabase: accounts, sync state, community submissions, and the feedback
 * table.
 *
 * app_feedback is the highest-value block here. It is the review ask's
 * UNHAPPY path plus the Settings "Share feedback" door, so every row is a
 * complaint or a request that deliberately did NOT go to the App Store. It is
 * insert-only from an edge function and readable only with the service role,
 * which is why this source exists at all.
 *
 * The service key is fetched from the logged-in Supabase CLI on demand and is
 * never written to the snapshot. That is the existing convention in this
 * project: the key lives in exactly one place, and it is not this repo.
 */

const {execFileSync} = require('child_process');
const {ok, missing, unavailable, SUPABASE_PROJECT_REF} = require('../config');

const REST = `https://${SUPABASE_PROJECT_REF}.supabase.co/rest/v1`;

/**
 * The anon key cannot read any of these tables, so falling back to it would
 * look like empty data.
 * @param {string} json
 * @returns {string}
 */
function serviceKeyFrom(json) {
  const keys = JSON.parse(json);
  const entry = keys.find(k => k.id === 'service_role' || k.name === 'service_role');
  if (!entry || !entry.api_key) {
    throw new Error('no service_role key in the CLI listing');
  }
  return entry.api_key;
}

function loadServiceKey(execImpl) {
  const run =
    execImpl ||
    (() =>
      execFileSync(
        'supabase',
        ['projects', 'api-keys', '--project-ref', SUPABASE_PROJECT_REF, '-o', 'json'],
        {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']},
      ));
  return serviceKeyFrom(run());
}

/**
 * One PostgREST query. `count=exact` with an empty range makes Postgres do the
 * counting: the total arrives in the content-range header as `0-0/<total>`.
 */
async function query(fetchImpl, key, pathAndQuery, {rows = 0} = {}) {
  const response = await fetchImpl(`${REST}/${pathAndQuery}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
      Prefer: 'count=exact',
      Range: `0-${Math.max(0, rows - 1)}`,
    },
  });
  if (!response.ok) {
    throw new Error(`Supabase HTTP ${response.status} on ${pathAndQuery.split('?')[0]}`);
  }
  const range = response.headers.get('content-range') || '';
  const total = Number(range.split('/')[1]);
  return {total: Number.isFinite(total) ? total : null, rows: rows ? await response.json() : []};
}

async function block(fn) {
  try {
    return await fn();
  } catch (e) {
    return unavailable(e.message);
  }
}

/**
 * @param {{env?: Record<string, string>, window: import('../config').Window,
 *          fetchImpl?: Function, execImpl?: Function}} context
 * @returns {Promise<import('../config').SourceResult>}
 */
async function fetchSupabase({window, execImpl, fetchImpl, env}) {
  const fetcher = fetchImpl || fetch;

  // An unfilled app-config is a setup step, not a backend failure, and saying
  // so beats a confusing 404 against a URL with an empty subdomain.
  if (!SUPABASE_PROJECT_REF) {
    return unavailable(
      'SUPABASE_PROJECT_REF is empty in scripts/monitoring/app-config.js. Fill it in, or drop ' +
        '"supabase" from SOURCES if this app has no backend.',
    );
  }

  let key;
  try {
    key = loadServiceKey(execImpl);
  } catch (e) {
    return unavailable(
      `Supabase CLI could not provide the service key (${e.message}). Run \`supabase login\` and \`supabase link --project-ref ${SUPABASE_PROJECT_REF}\`.`,
    );
  }

  const since = window.since.toISOString();

  const accounts = await block(async () => {
    const total = await query(fetcher, key, 'profiles?select=id');
    const fresh = await query(fetcher, key, `profiles?select=id&created_at=gte.${since}`);
    return ok({total: total.total, newInWindow: fresh.total});
  });

  const sync = await block(async () => {
    const total = await query(fetcher, key, 'user_state?select=user_id');
    const fresh = await query(fetcher, key, `user_state?select=user_id&updated_at=gte.${since}`);
    return ok({rows: total.total, updatedInWindow: fresh.total});
  });

  const feedback = await block(async () => {
    const result = await query(
      fetcher,
      key,
      `app_feedback?select=created_at,message,app_version,platform&created_at=gte.${since}&order=created_at.desc`,
      {rows: 50},
    );
    if (!result.total) {
      return missing('no feedback in this window');
    }
    const byPlatform = {};
    const byVersion = {};
    for (const note of result.rows) {
      byPlatform[note.platform || 'unknown'] = (byPlatform[note.platform || 'unknown'] || 0) + 1;
      byVersion[note.app_version || 'unknown'] = (byVersion[note.app_version || 'unknown'] || 0) + 1;
    }
    // The notes carry reader text, so they stay in the gitignored snapshot.
    // render.js prints counts only; the narrative quotes from here.
    return ok({count: result.total, notes: result.rows, byPlatform, byVersion});
  });

  const submissions = await block(async () => {
    const result = await query(
      fetcher,
      key,
      `sync_map_submissions?select=id&created_at=gte.${since}`,
    );
    return result.total ? ok({newInWindow: result.total}) : missing('no submissions in this window');
  });

  /**
   * Edge function logs live behind the Management API, not the service key.
   * Reporting "0 errors" here without that token would be the exact lie this
   * whole design exists to prevent, so it stays unavailable until the token
   * is configured.
   */
  const functionErrors = (env || {}).SUPABASE_ACCESS_TOKEN
    ? await block(async () => fetchFunctionErrors({fetchImpl: fetcher, token: env.SUPABASE_ACCESS_TOKEN, since}))
    : unavailable(
        'edge function logs need SUPABASE_ACCESS_TOKEN (Management API); the service key cannot read them',
      );

  return ok({accounts, sync, feedback, submissions, functionErrors});
}

/** Management API log query, only reachable with a personal access token. */
async function fetchFunctionErrors({fetchImpl, token, since}) {
  const sql = encodeURIComponent(
    'select function_id, count(*) as errors from function_edge_logs ' +
      'where response.status_code >= 500 group by function_id',
  );
  const response = await fetchImpl(
    `https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/analytics/endpoints/logs.all?sql=${sql}`,
    {headers: {Authorization: `Bearer ${token}`, Accept: 'application/json'}},
  );
  if (!response.ok) {
    throw new Error(`Supabase Management API HTTP ${response.status}`);
  }
  const body = await response.json();
  const rows = (body && body.result) || [];
  return rows.length ? ok({since, rows}) : missing('no edge function 5xx in this window');
}

module.exports = {fetchSupabase, serviceKeyFrom};
