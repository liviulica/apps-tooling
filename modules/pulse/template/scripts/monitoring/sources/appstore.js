'use strict';
/* eslint-env node */

/**
 * App Store Connect, plus the one public endpoint that fills its gaps.
 *
 * Four blocks, each carrying its own three-state status, because they fail
 * independently and for different reasons:
 *
 *   reviews   ASC /customerReviews. Needs the API key. TEXT reviews only:
 *             a star rating with no words is invisible to this endpoint, and
 *             those are the majority.
 *   ratings   itunes.apple.com/lookup. Needs NOTHING, works before any setup,
 *             and is the only way to see the star average at all. ASC has no
 *             per-territory rating endpoint, so this is per storefront.
 *   sales     ASC /salesReports. Needs the API key AND the vendor number,
 *             which is a separate value people rarely have to hand.
 *   releases  ASC /appStoreVersions + /builds. Needs the API key.
 *
 * The source as a whole is `unavailable` only when every block failed.
 */

const crypto = require('crypto');
const fs = require('fs');
const zlib = require('zlib');
const {
  ok,
  missing,
  unavailable,
  requireEnv,
  summariseReasons,
  REQUIRED_ENV,
  APP_STORE_APP_ID,
  RATING_STOREFRONTS,
} = require('../config');
const {ratingTally} = require('../metrics');

const API = 'https://api.appstoreconnect.apple.com';
/** Apple rejects anything older than 20 minutes. */
const TOKEN_LIFETIME_S = 15 * 60;
/** 200 per page; five pages is 1000 reviews, far past anything this app will see in a week. */
const MAX_REVIEW_PAGES = 5;

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

/**
 * ES256, signed with the .p8 private key.
 *
 * `dsaEncoding: 'ieee-p1363'` is the whole trick: Node's default is ASN.1
 * DER, which is a perfectly valid ECDSA signature that Apple answers with a
 * flat 401. JWS requires the fixed-width r||s form.
 */
/**
 * @param {{keyId: string, issuerId: string, privateKey: string, now?: Date}} options
 * @returns {string}
 */
function signJwt({keyId, issuerId, privateKey, now}) {
  const iat = Math.floor((now ? now.getTime() : Date.now()) / 1000);
  const header = {alg: 'ES256', kid: keyId, typ: 'JWT'};
  const payload = {iss: issuerId, iat, exp: iat + TOKEN_LIFETIME_S, aud: 'appstoreconnect-v1'};
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = crypto
    .createSign('SHA256')
    .update(signingInput)
    .sign({key: privateKey, dsaEncoding: 'ieee-p1363'});
  return `${signingInput}.${signature.toString('base64url')}`;
}

/** One authenticated GET. Any non-2xx becomes a reason string, never an empty result. */
async function ascGet(fetchImpl, token, url) {
  const response = await fetchImpl(url, {
    headers: {Authorization: `Bearer ${token}`, Accept: 'application/json'},
  });
  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json();
      detail = body && body.errors && body.errors[0] ? `: ${body.errors[0].detail || body.errors[0].title}` : '';
    } catch (e) {
      detail = '';
    }
    throw new Error(`App Store Connect HTTP ${response.status}${detail}`);
  }
  return response.json();
}

function normaliseReview(entry) {
  const a = (entry && entry.attributes) || {};
  return {
    id: entry.id,
    rating: a.rating,
    title: a.title,
    body: a.body,
    nickname: a.reviewerNickname,
    createdDate: a.createdDate,
    territory: a.territory,
  };
}

async function fetchReviews({fetchImpl, token, window, checkpointId}) {
  const collected = [];
  let url =
    `${API}/v1/apps/${APP_STORE_APP_ID}/customerReviews` +
    '?limit=200&sort=-createdDate&fields[customerReviews]=rating,title,body,reviewerNickname,createdDate,territory';
  let reachedEdge = false;

  for (let page = 0; page < MAX_REVIEW_PAGES && url && !reachedEdge; page += 1) {
    const body = await ascGet(fetchImpl, token, url);
    for (const entry of body.data || []) {
      if (checkpointId && entry.id === checkpointId) {
        reachedEdge = true;
        break;
      }
      const review = normaliseReview(entry);
      if (new Date(review.createdDate) < window.since) {
        reachedEdge = true;
        break;
      }
      collected.push(review);
    }
    url = (body.links && body.links.next) || null;
  }

  if (collected.length === 0) {
    return missing('no reviews in this window');
  }
  return ok({
    reviews: collected,
    tally: ratingTally(collected),
    latestId: collected[0].id,
  });
}

/**
 * The public storefront lookup. No auth, no key, no setup, and the only place
 * the star average lives. One storefront can 404 without killing the block.
 */
async function fetchRatings({fetchImpl}) {
  const storefronts = [];
  const failures = [];
  for (const country of RATING_STOREFRONTS) {
    try {
      const response = await fetchImpl(
        `https://itunes.apple.com/lookup?id=${APP_STORE_APP_ID}&country=${country}`,
      );
      if (!response.ok) {
        failures.push(`${country} HTTP ${response.status}`);
        continue;
      }
      const body = await response.json();
      const entry = (body.results || [])[0];
      if (!entry) {
        failures.push(`${country} not on this storefront`);
        continue;
      }
      // Apple sends averageUserRating: 0 for an app nobody has rated. Zero
      // stars is a claim, and a damaging one, so an unrated storefront has a
      // null average rather than a zero.
      const count = entry.userRatingCount || 0;
      storefronts.push({
        country,
        average: count > 0 && typeof entry.averageUserRating === 'number' ? entry.averageUserRating : null,
        count,
        version: entry.version,
      });
    } catch (e) {
      failures.push(`${country} ${e.message}`);
    }
  }
  if (storefronts.length === 0) {
    return unavailable(`iTunes lookup failed (${failures.join('; ')})`);
  }
  const rated = storefronts.filter(s => s.count > 0);
  if (rated.length === 0) {
    return ok({storefronts, totalRatings: 0});
  }
  return ok({
    storefronts,
    totalRatings: rated.reduce((sum, s) => sum + s.count, 0),
  });
}

/**
 * Daily sales summary reports, one gzipped TSV per day. Units and proceeds
 * only: this is a sanity check against RevenueCat, not the revenue source of
 * truth.
 */
async function fetchSales({fetchImpl, token, window, vendorNumber, env = {}}) {
  if (!vendorNumber) {
    return unavailable(
      'not configured: ASC_VENDOR_NUMBER missing from .env.monitoring.local (see docs/monitoring-setup.md)',
    );
  }
  const days = [];
  for (let i = 0; i < window.days; i += 1) {
    days.push(new Date(window.until.getTime() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  }

  let units = 0;
  let proceeds = 0;
  let currency = null;
  let answered = 0;
  const failures = [];

  for (const day of days) {
    const url =
      `${API}/v1/salesReports?filter[frequency]=DAILY&filter[reportType]=SALES` +
      `&filter[reportSubType]=SUMMARY&filter[vendorNumber]=${vendorNumber}&filter[reportDate]=${day}`;
    try {
      const response = await fetchImpl(url, {
        headers: {Authorization: `Bearer ${token}`, Accept: 'application/a-gzip'},
      });
      // 404 means Apple has no report for that day yet, which is normal for
      // the most recent day and for days with no activity at all.
      if (response.status === 404) {
        answered += 1;
        continue;
      }
      if (!response.ok) {
        // 403 here is almost always the key's ROLE, not the vendor number:
        // sales reports need Finance, Sales or Admin access, and a
        // Developer-role key reads reviews perfectly well while being refused
        // every report. Apple's own words say "does not allow this request",
        // which is easy to misread as a bad vendor number.
        failures.push([
          day,
          response.status === 403
            ? 'HTTP 403: this App Store Connect API key is not allowed to read sales reports. ' +
              'Sales need a key with Finance, Sales or Admin access; a Developer-role key can read ' +
              'reviews but never reports. Change the role of key ' +
              `${env.ASC_KEY_ID} or add one with Finance access.`
            : `HTTP ${response.status}`,
        ]);
        continue;
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      const tsv = zlib.gunzipSync(buffer).toString('utf8');
      for (const line of tsv.split('\n').slice(1)) {
        const cols = line.split('\t');
        if (cols.length < 20) {
          continue;
        }
        units += Number(cols[7]) || 0;
        proceeds += (Number(cols[8]) || 0) * (Number(cols[7]) || 0);
        currency = currency || cols[11] || null;
      }
      answered += 1;
    } catch (e) {
      failures.push([day, e.message]);
    }
  }

  if (answered === 0) {
    // One cause across every day is stated once. Fourteen identical 403s in a
    // row is not fourteen facts.
    return unavailable(`sales reports unreadable. ${summariseReasons(failures)}`);
  }
  return ok({units, proceeds: Number(proceeds.toFixed(2)), currency, daysCovered: answered});
}

/** What is live and what is in flight, so a report can be read against a release. */
async function fetchReleases({fetchImpl, token}) {
  try {
    const versions = await ascGet(
      fetchImpl,
      token,
      `${API}/v1/apps/${APP_STORE_APP_ID}/appStoreVersions?limit=5`,
    );
    const builds = await ascGet(
      fetchImpl,
      token,
      `${API}/v1/builds?filter[app]=${APP_STORE_APP_ID}&limit=5&sort=-uploadedDate`,
    );
    return ok({
      versions: (versions.data || []).map(v => ({
        version: v.attributes && v.attributes.versionString,
        state: v.attributes && (v.attributes.appVersionState || v.attributes.appStoreState),
        releaseType: v.attributes && v.attributes.releaseType,
      })),
      builds: (builds.data || []).map(b => ({
        version: b.attributes && b.attributes.version,
        uploadedDate: b.attributes && b.attributes.uploadedDate,
        processingState: b.attributes && b.attributes.processingState,
        expired: b.attributes && b.attributes.expired,
      })),
    });
  } catch (e) {
    return unavailable(e.message);
  }
}

/**
 * @param {{env?: Record<string, string>, window: import('../config').Window,
 *          fetchImpl?: Function, checkpointId?: string, execImpl?: Function}} context
 * @returns {Promise<import('../config').SourceResult>}
 */
async function fetchAppStore({env, window, fetchImpl, checkpointId}) {
  const fetcher = fetchImpl || fetch;

  // Without the store id every request below is meaningless, and the lookup
  // endpoint would answer a cheerful empty result for app id "".
  if (!APP_STORE_APP_ID) {
    return unavailable(
      'APP_STORE_APP_ID is empty in scripts/monitoring/app-config.js. Fill it in, or drop ' +
        '"reviews" from SOURCES if this app is not on the App Store.',
    );
  }

  const ratings = await fetchRatings({fetchImpl: fetcher});

  const credentials = requireEnv(env || {}, REQUIRED_ENV.reviews);
  if (!credentials.ok) {
    const blocked = unavailable(credentials.reason);
    return settle({reviews: blocked, ratings, sales: blocked, releases: blocked});
  }

  let privateKey;
  try {
    privateKey = fs.readFileSync(env.ASC_P8_PATH, 'utf8');
  } catch (e) {
    const blocked = unavailable(`cannot read ASC_P8_PATH (${env.ASC_P8_PATH}): ${e.code || e.message}`);
    return settle({reviews: blocked, ratings, sales: blocked, releases: blocked});
  }

  let token;
  try {
    token = signJwt({keyId: env.ASC_KEY_ID, issuerId: env.ASC_ISSUER_ID, privateKey});
  } catch (e) {
    const blocked = unavailable(`could not sign the App Store Connect token: ${e.message}`);
    return settle({reviews: blocked, ratings, sales: blocked, releases: blocked});
  }

  const [reviews, sales, releases] = await Promise.all([
    fetchReviews({fetchImpl: fetcher, token, window, checkpointId}).catch(e => unavailable(e.message)),
    fetchSales({fetchImpl: fetcher, token, window, vendorNumber: env.ASC_VENDOR_NUMBER, env}).catch(e =>
      unavailable(e.message),
    ),
    fetchReleases({fetchImpl: fetcher, token}),
  ]);

  return settle({reviews, ratings, sales, releases});
}

/** The source answered if ANY block did. */
function settle(blocks) {
  const answered = Object.values(blocks).some(block => block.status !== 'unavailable');
  if (!answered) {
    return {
      ...unavailable(summariseReasons(Object.entries(blocks).map(([name, block]) => [name, block.reason]))),
      data: blocks,
    };
  }
  return ok(blocks);
}

module.exports = {signJwt, fetchAppStore};
