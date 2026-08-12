/**
 * The pure half of the pulse. No network, no clock, no files: given numbers,
 * produce numbers. Every function here returns null rather than 0 or NaN when
 * the input cannot support an answer, because a rendered 0 is a claim.
 */
import {
  delta,
  conversion,
  ratingTally,
  crashFreeRate,
  rate,
  topBy,
} from '../scripts/monitoring/metrics';

describe('delta', () => {
  it('suppresses the comparison when the previous run could not answer', () => {
    expect(delta(10, null)).toBeNull();
    expect(delta(10, undefined)).toBeNull();
  });

  it('suppresses the comparison when this run could not answer', () => {
    expect(delta(null, 4)).toBeNull();
  });

  it('reports direction and magnitude', () => {
    expect(delta(10, 4)).toEqual({value: 10, previous: 4, change: 6, direction: 'up'});
    expect(delta(4, 10)).toEqual({value: 4, previous: 10, change: -6, direction: 'down'});
    expect(delta(4, 4)).toEqual({value: 4, previous: 4, change: 0, direction: 'flat'});
  });

  it('treats a real zero as a real number', () => {
    expect(delta(0, 3)).toEqual({value: 0, previous: 3, change: -3, direction: 'down'});
  });
});

describe('conversion', () => {
  it('computes step to step, not step to first', () => {
    expect(conversion([100, 50, 25])).toEqual([1, 0.5, 0.5]);
  });

  it('returns null for a step whose predecessor was zero, never Infinity or NaN', () => {
    expect(conversion([0, 0])).toEqual([null, null]);
    expect(conversion([10, 0, 0])).toEqual([1, 0, null]);
  });

  it('returns an empty list for no steps', () => {
    expect(conversion([])).toEqual([]);
  });
});

describe('rate', () => {
  it('refuses to divide by zero', () => {
    expect(rate(5, 0)).toBeNull();
    expect(rate(5, 10)).toBe(0.5);
  });
});

describe('ratingTally', () => {
  it('does not invent an average out of no ratings', () => {
    expect(ratingTally([])).toEqual({
      count: 0,
      average: null,
      byStar: {1: 0, 2: 0, 3: 0, 4: 0, 5: 0},
    });
  });

  it('averages and buckets by star', () => {
    const t = ratingTally([{rating: 5}, {rating: 3}, {rating: 5}]);
    expect(t.count).toBe(3);
    expect(t.average).toBeCloseTo(4.333, 3);
    expect(t.byStar[5]).toBe(2);
    expect(t.byStar[3]).toBe(1);
  });

  it('ignores a rating outside 1..5 rather than skewing the average', () => {
    const t = ratingTally([{rating: 5}, {rating: 0}, {rating: 9}]);
    expect(t.count).toBe(1);
    expect(t.average).toBe(5);
  });
});

describe('crashFreeRate', () => {
  it('is a fraction of sessions', () => {
    expect(crashFreeRate(1000, 5)).toBe(0.995);
  });

  it('is null with no sessions, not 100 percent healthy', () => {
    expect(crashFreeRate(0, 0)).toBeNull();
    expect(crashFreeRate(null, 0)).toBeNull();
  });

  it('clamps a nonsensical excess of crashes to zero rather than going negative', () => {
    expect(crashFreeRate(10, 20)).toBe(0);
  });
});

describe('topBy', () => {
  it('sorts descending and caps', () => {
    const rows = [{n: 1}, {n: 9}, {n: 5}];
    expect(topBy(rows, r => r.n, 2)).toEqual([{n: 9}, {n: 5}]);
  });

  it('handles an empty list', () => {
    expect(topBy([], (r: {n: number}) => r.n, 3)).toEqual([]);
  });
});
