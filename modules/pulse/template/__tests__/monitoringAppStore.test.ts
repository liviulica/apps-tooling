/**
 * App Store Connect: the JWT, the reviews, and the two gaps the API refuses
 * to fill (star-only ratings, and any per-territory rating at all), which the
 * free iTunes lookup endpoint covers instead.
 */
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {signJwt, fetchAppStore} from '../scripts/monitoring/sources/appstore';

function tempKey(): string {
  const {privateKey} = crypto.generateKeyPairSync('ec', {namedCurve: 'prime256v1'});
  const pem = privateKey.export({type: 'pkcs8', format: 'pem'}) as string;
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'asc-')), 'AuthKey_TEST.p8');
  fs.writeFileSync(file, pem);
  return file;
}

const WINDOW = {
  days: 7,
  since: new Date('2026-08-05T00:00:00Z'),
  until: new Date('2026-08-12T00:00:00Z'),
};

function env(overrides: Record<string, string> = {}) {
  return {
    ASC_KEY_ID: 'ABC1234567',
    ASC_ISSUER_ID: '11111111-2222-3333-4444-555555555555',
    ASC_P8_PATH: tempKey(),
    ...overrides,
  };
}

/** A fetch stand-in that answers by URL substring. */
function fakeFetch(routes: Array<[string, {status?: number; body?: unknown}]>) {
  const calls: string[] = [];
  const impl = async (url: string) => {
    calls.push(url);
    const hit = routes.find(([fragment]) => url.includes(fragment));
    const {status = 200, body = {}} = hit ? hit[1] : {status: 404, body: {}};
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  };
  return {impl, calls};
}

const NO_REVIEWS = {data: [], links: {}};
const RATING_BODY = {
  resultCount: 1,
  results: [{averageUserRating: 4.5, userRatingCount: 12, version: '1.5.0'}],
};

describe('signJwt', () => {
  it('produces three base64url parts with an ES256 header naming the key', () => {
    const token = signJwt({
      keyId: 'ABC1234567',
      issuerId: 'issuer-1',
      privateKey: fs.readFileSync(tempKey(), 'utf8'),
      now: new Date('2026-08-12T00:00:00Z'),
    });
    const parts = token.split('.');
    expect(parts).toHaveLength(3);
    expect(token).not.toMatch(/[+/=]/);
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    expect(header).toEqual({alg: 'ES256', kid: 'ABC1234567', typ: 'JWT'});
  });

  it('scopes the token to the App Store Connect audience and expires it inside 20 minutes', () => {
    const now = new Date('2026-08-12T00:00:00Z');
    const token = signJwt({keyId: 'K', issuerId: 'I', privateKey: fs.readFileSync(tempKey(), 'utf8'), now});
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    expect(payload.aud).toBe('appstoreconnect-v1');
    expect(payload.iss).toBe('I');
    expect(payload.exp - payload.iat).toBeLessThanOrEqual(20 * 60);
    expect(payload.exp).toBeGreaterThan(payload.iat);
  });

  it('signs in the P1363 form Apple accepts, not ASN.1 DER', () => {
    const token = signJwt({keyId: 'K', issuerId: 'I', privateKey: fs.readFileSync(tempKey(), 'utf8')});
    const signature = Buffer.from(token.split('.')[2], 'base64url');
    // r || s, 32 bytes each for P-256. A DER signature is variable length and
    // starts with 0x30, and Apple rejects it with a 401.
    expect(signature).toHaveLength(64);
    expect(signature[0]).not.toBe(0x30);
  });
});

describe('fetchAppStore credentials', () => {
  it('is unavailable, not empty, when the key is not configured', async () => {
    const {impl} = fakeFetch([['itunes.apple.com', {body: RATING_BODY}]]);
    const result = await fetchAppStore({env: {}, window: WINDOW, fetchImpl: impl});
    expect(result.data.reviews.status).toBe('unavailable');
    expect(result.data.reviews.reason).toContain('ASC_KEY_ID');
    expect(result.data.reviews.data).toBeUndefined();
  });

  it('is unavailable when the .p8 file named by the env cannot be read', async () => {
    const {impl} = fakeFetch([['itunes.apple.com', {body: RATING_BODY}]]);
    const result = await fetchAppStore({
      env: env({ASC_P8_PATH: '/nope/AuthKey_MISSING.p8'}),
      window: WINDOW,
      fetchImpl: impl,
    });
    expect(result.data.reviews.status).toBe('unavailable');
    expect(result.data.reviews.reason).toMatch(/AuthKey_MISSING\.p8/);
  });

  it('still reports public star ratings with no credentials at all, because that endpoint needs none', async () => {
    const {impl} = fakeFetch([['itunes.apple.com', {body: RATING_BODY}]]);
    const result = await fetchAppStore({env: {}, window: WINDOW, fetchImpl: impl});
    expect(result.status).toBe('ok');
    expect(result.data.ratings.status).toBe('ok');
    expect(result.data.ratings.data.storefronts[0]).toMatchObject({average: 4.5, count: 12});
  });

  it('does not report zero stars for an app nobody has rated', async () => {
    // This is what Apple actually sends for an unrated storefront, verified
    // live against 1.5.0 on 2026-08-12.
    const {impl} = fakeFetch([
      [
        'itunes.apple.com',
        {body: {resultCount: 1, results: [{averageUserRating: 0, userRatingCount: 0, version: '1.5.0'}]},
        },
      ],
    ]);
    const result = await fetchAppStore({env: {}, window: WINDOW, fetchImpl: impl});
    expect(result.data.ratings.data.storefronts[0].average).toBeNull();
    expect(result.data.ratings.data.storefronts[0].count).toBe(0);
  });

  it('is unavailable overall only when every block failed', async () => {
    const {impl} = fakeFetch([['itunes.apple.com', {status: 503}]]);
    const result = await fetchAppStore({env: {}, window: WINDOW, fetchImpl: impl});
    expect(result.status).toBe('unavailable');
  });
});

describe('fetchAppStore reviews', () => {
  it('reads a 401 as unavailable, never as zero reviews', async () => {
    const {impl} = fakeFetch([
      ['customerReviews', {status: 401, body: {errors: [{detail: 'Authentication failed'}]}}],
      ['itunes.apple.com', {body: RATING_BODY}],
    ]);
    const result = await fetchAppStore({env: env(), window: WINDOW, fetchImpl: impl});
    expect(result.data.reviews.status).toBe('unavailable');
    expect(result.data.reviews.reason).toContain('401');
  });

  it('reads an empty list as missing, which is a real answer', async () => {
    const {impl} = fakeFetch([
      ['customerReviews', {body: NO_REVIEWS}],
      ['itunes.apple.com', {body: RATING_BODY}],
    ]);
    const result = await fetchAppStore({env: env(), window: WINDOW, fetchImpl: impl});
    expect(result.data.reviews.status).toBe('missing');
  });

  it('keeps only reviews inside the window and normalises them', async () => {
    const {impl} = fakeFetch([
      [
        'customerReviews',
        {
          body: {
            data: [
              {
                id: 'r1',
                attributes: {
                  rating: 5,
                  title: 'Lovely',
                  body: 'A calm place to read.',
                  reviewerNickname: 'someone',
                  createdDate: '2026-08-10T09:00:00Z',
                  territory: 'USA',
                },
              },
              {
                id: 'r0',
                attributes: {
                  rating: 2,
                  title: 'Old one',
                  body: 'Before the window.',
                  reviewerNickname: 'other',
                  createdDate: '2026-07-01T09:00:00Z',
                  territory: 'ROU',
                },
              },
            ],
            links: {},
          },
        },
      ],
      ['itunes.apple.com', {body: RATING_BODY}],
    ]);
    const result = await fetchAppStore({env: env(), window: WINDOW, fetchImpl: impl});
    expect(result.data.reviews.status).toBe('ok');
    expect(result.data.reviews.data.reviews).toHaveLength(1);
    expect(result.data.reviews.data.reviews[0]).toMatchObject({
      id: 'r1',
      rating: 5,
      title: 'Lovely',
      territory: 'USA',
    });
    expect(result.data.reviews.data.tally.average).toBe(5);
  });

  it('sends the bearer token it signed', async () => {
    const headers: Array<Record<string, string>> = [];
    const impl = async (url: string, init: {headers?: Record<string, string>} = {}) => {
      headers.push(init.headers || {});
      return {
        ok: true,
        status: 200,
        json: async () => (url.includes('itunes') ? RATING_BODY : NO_REVIEWS),
        text: async () => '',
      };
    };
    await fetchAppStore({env: env(), window: WINDOW, fetchImpl: impl});
    const authed = headers.filter(h => h.Authorization);
    expect(authed.length).toBeGreaterThan(0);
    expect(authed[0].Authorization).toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
  });
});

describe('fetchAppStore sales', () => {
  it('explains a 403 as the key ROLE, not as a bad vendor number, and says it once', async () => {
    // Verified live 2026-08-12: Apple answers every day with
    // "The API key in use does not allow this request" when the key is
    // Developer-role. Reviews keep working, which makes it easy to blame the
    // vendor number instead.
    const {impl} = fakeFetch([
      ['salesReports', {status: 403, body: {errors: [{detail: 'The API key in use does not allow this request'}]}}],
      ['customerReviews', {body: NO_REVIEWS}],
      ['itunes.apple.com', {body: RATING_BODY}],
    ]);
    const result = await fetchAppStore({
      env: env({ASC_VENDOR_NUMBER: '92983338'}),
      window: WINDOW,
      fetchImpl: impl,
    });
    const reason = result.data.sales.reason;
    expect(result.data.sales.status).toBe('unavailable');
    expect(reason).toContain('Finance');
    expect(reason).not.toContain('ASC_VENDOR_NUMBER');
    // Seven days, one cause, one sentence about it.
    expect(reason.match(/HTTP 403/g)).toHaveLength(1);
  });

  it('names the optional vendor number rather than pretending revenue is zero', async () => {
    const {impl} = fakeFetch([
      ['customerReviews', {body: NO_REVIEWS}],
      ['itunes.apple.com', {body: RATING_BODY}],
    ]);
    const result = await fetchAppStore({env: env(), window: WINDOW, fetchImpl: impl});
    expect(result.data.sales.status).toBe('unavailable');
    expect(result.data.sales.reason).toContain('ASC_VENDOR_NUMBER');
  });
});
