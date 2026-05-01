import { describe, it, expect } from 'vitest';
import { median, pctDelta } from '../../src/utils/median.js';

describe('median', () => {
  it('odd-length array returns middle', () => {
    expect(median([1, 5, 3])).toBe(3);
  });
  it('even-length array averages two middles', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
  it('throws on empty', () => {
    expect(() => median([])).toThrow();
  });
});

describe('pctDelta', () => {
  it('positive delta', () => {
    expect(pctDelta(110, 100)).toBeCloseTo(10);
  });
  it('negative delta', () => {
    expect(pctDelta(95, 100)).toBeCloseTo(-5);
  });
  it('zero anchor returns 0', () => {
    expect(pctDelta(5, 0)).toBe(0);
  });
});
