import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import {
  fetchWiseComparison,
  quoteFromWiseComparison,
  __resetWiseComparisonCache,
} from '../../src/providers/wiseComparisons.js';
import { installFetchMock, resetFetchMock } from '../helpers/mockFetch.js';
import { readFixtureJson } from '../helpers/fixtures.js';

const fixture = readFixtureJson<{
  sourceCurrency: string;
  targetCurrency: string;
  sourceAmount: number;
  providers: Array<{
    name: string;
    alias: string;
    quotes: Array<{
      rate: number;
      fee: number;
      sourceAmount: number;
      targetAmount: number;
      receivedAmount?: number;
    }>;
  }>;
}>('providers/wiseComparisons-USD-INR.json');

describe('quoteFromWiseComparison', () => {
  it('finds a provider by alias', () => {
    const q = quoteFromWiseComparison(
      fixture as Parameters<typeof quoteFromWiseComparison>[0],
      { from: 'USD', to: 'INR' },
      ['remitly'],
      'remitly',
    );
    expect(q.providerId).toBe('remitly');
    expect(q.rate).toBe(94.2);
    expect(q.dataSource).toBe('wise_comparisons');
  });

  it('finds a provider by name (case-insensitive)', () => {
    const q = quoteFromWiseComparison(
      fixture as Parameters<typeof quoteFromWiseComparison>[0],
      { from: 'USD', to: 'INR' },
      ['Wells Fargo'],
      'wellsFargo',
    );
    expect(q.providerId).toBe('wellsFargo');
    expect(q.rate).toBe(92.5);
  });

  it('throws when provider not found', () => {
    expect(() =>
      quoteFromWiseComparison(
        fixture as Parameters<typeof quoteFromWiseComparison>[0],
        { from: 'USD', to: 'INR' },
        ['nonexistent'],
        'no',
      ),
    ).toThrow(/no quote found/i);
  });

  it('marks dataSource as wise_comparisons', () => {
    const q = quoteFromWiseComparison(
      fixture as Parameters<typeof quoteFromWiseComparison>[0],
      { from: 'USD', to: 'INR' },
      ['xoom'],
      'xoom',
    );
    expect(q.dataSource).toBe('wise_comparisons');
  });
});

describe('fetchWiseComparison memoization', () => {
  beforeEach(() => __resetWiseComparisonCache());
  afterEach(() => resetFetchMock());

  it('returns the same response for the same key within TTL', async () => {
    const { calls } = installFetchMock({
      'https://api.wise.com/v3/comparisons/': { body: fixture },
    });
    const a = await fetchWiseComparison({ from: 'USD', to: 'INR' }, 1000);
    const b = await fetchWiseComparison({ from: 'USD', to: 'INR' }, 1000);
    expect(a).toBe(b);
    expect(calls.length).toBe(1);
  });

  it('makes separate calls for different amounts', async () => {
    const { calls } = installFetchMock({
      'https://api.wise.com/v3/comparisons/': { body: fixture },
    });
    await fetchWiseComparison({ from: 'USD', to: 'INR' }, 200);
    await fetchWiseComparison({ from: 'USD', to: 'INR' }, 5000);
    expect(calls.length).toBe(2);
  });
});
