import {describe, expect, it} from 'vitest';
import {isFeatureUnlocked, resolveEntitlement} from '../template/lib/monetization/entitlements';
import {
  annualSavingsPercent,
  mapPackages,
  toEntitlementState,
  trialLength,
} from '../template/lib/monetization/packages';
import {GATE_COPY, PAYWALL_FEATURE_ORDER, type PlusFeature} from '../template/lib/monetization/gates';
import {UNCONFIGURED_STATE} from '../template/lib/monetization/types';

const ALL_GATES = Object.keys(GATE_COPY) as PlusFeature[];

describe('entitlement resolution', () => {
  it('unconfigured builds keep every gate open (ship-dark safety)', () => {
    for (const gate of ALL_GATES) {
      expect(isFeatureUnlocked(UNCONFIGURED_STATE, gate)).toBe(true);
    }
  });

  it('configured without the entitlement locks every gate', () => {
    const state = {isPlus: false, expiresAt: null, configured: true};
    for (const gate of ALL_GATES) {
      expect(isFeatureUnlocked(state, gate)).toBe(false);
    }
  });

  it('configured with the entitlement unlocks every gate', () => {
    const state = {isPlus: true, expiresAt: null, configured: true};
    for (const gate of ALL_GATES) {
      expect(isFeatureUnlocked(state, gate)).toBe(true);
    }
  });

  it('active subscription with a future expiry is entitled', () => {
    const state = resolveEntitlement({
      active: true,
      expiresAt: '2999-01-01T00:00:00Z',
      now: new Date('2026-07-11T00:00:00Z'),
    });
    expect(state.isPlus).toBe(true);
    expect(state.configured).toBe(true);
  });

  it('a stale cache with a past expiry is NOT entitled even if flagged active', () => {
    const state = resolveEntitlement({
      active: true,
      expiresAt: '2026-01-01T00:00:00Z',
      now: new Date('2026-07-11T00:00:00Z'),
    });
    expect(state.isPlus).toBe(false);
  });

  it('lifetime (no expiry) stays entitled', () => {
    const state = resolveEntitlement({active: true, expiresAt: null});
    expect(state.isPlus).toBe(true);
    expect(state.expiresAt).toBeNull();
  });
});

describe('customer info mapping', () => {
  it('reads the entitlement from the active map', () => {
    const state = toEntitlementState({
      entitlements: {
        active: {plus: {isActive: true, expirationDate: '2999-01-01T00:00:00Z'}},
      },
    });
    expect(state.isPlus).toBe(true);
  });

  it('missing entitlement resolves to configured-but-locked', () => {
    const state = toEntitlementState({entitlements: {active: {}}});
    expect(state).toEqual({isPlus: false, expiresAt: null, configured: true});
  });

  it('other entitlements do not unlock', () => {
    const state = toEntitlementState({
      entitlements: {active: {other: {isActive: true, expirationDate: null}}},
    });
    expect(state.isPlus).toBe(false);
  });
});

describe('package mapping', () => {
  const pkg = (
    identifier: string,
    packageType: string,
    priceString = '$1.99',
    price = 1.99,
    introPrice: {price: number; periodUnit: string; periodNumberOfUnits: number; cycles?: number} | null = null,
  ) => ({
    identifier,
    packageType,
    product: {identifier: `prod_${identifier}`, priceString, price, introPrice},
  });

  it('maps the three sold types and orders annual first', () => {
    const mapped = mapPackages([
      pkg('$rc_monthly', 'MONTHLY', '$2.99'),
      pkg('$rc_lifetime', 'LIFETIME', '$59.99'),
      pkg('$rc_annual', 'ANNUAL', '$19.99'),
    ]);
    expect(mapped.map(p => p.packageType)).toEqual(['annual', 'monthly', 'lifetime']);
  });

  it('drops unknown package types instead of guessing', () => {
    const mapped = mapPackages([
      pkg('$rc_weekly', 'WEEKLY'),
      pkg('$rc_monthly', 'MONTHLY'),
      pkg('custom', 'CUSTOM'),
    ]);
    expect(mapped.map(p => p.packageType)).toEqual(['monthly']);
  });

  it('keeps the store-localized price string verbatim', () => {
    const mapped = mapPackages([pkg('$rc_monthly', 'MONTHLY', '2,99 €')]);
    expect(mapped[0].priceString).toBe('2,99 €');
  });
});

/**
 * Trials are the sharpest edge in this module. A store product advertises its
 * introductory offer to EVERYONE, but iOS eligibility is per account (one per
 * subscription group), so a paywall built from the product alone promises a
 * free week to customers the store will charge in full. See
 * paywall-guidelines.md, "Trial claims: eligibility, not availability".
 */
describe('trial claims', () => {
  const annual = (intro: {price: number; periodUnit: string; periodNumberOfUnits: number; cycles?: number} | null) => ({
    identifier: '$rc_annual',
    packageType: 'ANNUAL',
    product: {identifier: 'prod_annual', priceString: '$19.99', price: 19.99, introPrice: intro},
  });
  const FREE_WEEK = {price: 0, periodUnit: 'WEEK', periodNumberOfUnits: 1};

  it('an ELIGIBLE account keeps the trial; an ineligible one never sees it', () => {
    expect(mapPackages([annual(FREE_WEEK)], new Set(['prod_annual']))[0].trial).toBe('1 week');
    expect(mapPackages([annual(FREE_WEEK)], new Set())[0].trial).toBeNull();
  });

  it('a null eligibility set means the store already curated offers (Google Play)', () => {
    expect(mapPackages([annual(FREE_WEEK)], null)[0].trial).toBe('1 week');
  });

  it('a PAID introductory price is not a trial', () => {
    const paid = {price: 9.99, periodUnit: 'MONTH', periodNumberOfUnits: 1};
    expect(mapPackages([annual(paid)], null)[0].trial).toBeNull();
  });

  it('a multi-cycle free offer states its whole span', () => {
    expect(mapPackages([annual({...FREE_WEEK, cycles: 2})], null)[0].trial).toBe('2 weeks');
  });

  it('an unrecognized period unit yields no trial line rather than a wrong one', () => {
    expect(trialLength('FORTNIGHT', 1)).toBeNull();
    expect(trialLength('WEEK', 0)).toBeNull();
    expect(trialLength('DAY', 3)).toBe('3 days');
  });
});

describe('savings badge: evidence or nothing', () => {
  const plus = (packageType: 'annual' | 'monthly', price: number) => ({
    identifier: `$rc_${packageType}`,
    packageType,
    priceString: 'x',
    periodLabel: 'x',
    price,
    trial: null,
  });

  it('states the store’s own arithmetic', () => {
    expect(annualSavingsPercent([plus('annual', 99.99), plus('monthly', 14.99)])).toBe(44);
  });

  it('is null with nothing to compare, or when annual is not actually cheaper', () => {
    expect(annualSavingsPercent([plus('annual', 99.99)])).toBeNull();
    expect(annualSavingsPercent([plus('annual', 200), plus('monthly', 14.99)])).toBeNull();
    expect(annualSavingsPercent([plus('annual', 11.6), plus('monthly', 1)])).toBeNull();
  });
});

describe('gate catalog', () => {
  it('every gate has paywall copy and appears on the paywall', () => {
    for (const gate of ALL_GATES) {
      expect(GATE_COPY[gate].benefit.length).toBeGreaterThan(0);
      expect(PAYWALL_FEATURE_ORDER).toContain(gate);
    }
    expect(PAYWALL_FEATURE_ORDER).toHaveLength(ALL_GATES.length);
  });
});
