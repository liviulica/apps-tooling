import {describe, expect, it} from 'vitest';
import {isFeatureUnlocked, resolveEntitlement} from '../template/lib/monetization/entitlements';
import {mapPackages, toEntitlementState} from '../template/lib/monetization/packages';
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
  const pkg = (identifier: string, packageType: string, priceString = '$1.99') => ({
    identifier,
    packageType,
    product: {priceString},
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

describe('gate catalog', () => {
  it('every gate has paywall copy and appears on the paywall', () => {
    for (const gate of ALL_GATES) {
      expect(GATE_COPY[gate].benefit.length).toBeGreaterThan(0);
      expect(PAYWALL_FEATURE_ORDER).toContain(gate);
    }
    expect(PAYWALL_FEATURE_ORDER).toHaveLength(ALL_GATES.length);
  });
});
