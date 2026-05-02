import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { instaremProvider } from '../../src/providers/instarem.js';
import { __resetWiseComparisonCache } from '../../src/providers/wiseComparisons.js';
import { installFetchMock, resetFetchMock } from '../helpers/mockFetch.js';
import { readFixtureJson } from '../helpers/fixtures.js';

const success = readFixtureJson('providers/instarem-success.json');
const wiseFixture = readFixtureJson('providers/wiseComparisons-USD-INR.json');

describe('instaremProvider.fetchQuote', () => {
  beforeEach(() => __resetWiseComparisonCache());
  afterEach(() => resetFetchMock());

  it('parses a successful Instarem direct response', async () => {
    installFetchMock({
      'https://www.instarem.com/api/v1/public/transaction/computed-value': { body: success },
    });
    const q = await instaremProvider.fetchQuote({
      pair: { from: 'USD', to: 'INR' },
      sendAmount: 1000,
    });
    const single = Array.isArray(q) ? q[0]! : q;
    expect(single.providerId).toBe('instarem');
    expect(single.dataSource).toBe('instarem_api');
    expect(single.rate).toBe(94.5);
    expect(single.feeAmount).toBe(2.5);
    expect(single.receiveAmount).toBe(94252.5);
  });

  it('falls back to Wise comparison when Instarem returns 401', async () => {
    installFetchMock({
      'https://www.instarem.com/api/v1/public/transaction/computed-value': {
        status: 401,
        body: { success: false, data: { message: 'Session Expired' } },
      },
      'https://api.wise.com/v3/comparisons/': { body: wiseFixture },
    });
    const q = await instaremProvider.fetchQuote({
      pair: { from: 'USD', to: 'INR' },
      sendAmount: 1000,
    });
    const single = Array.isArray(q) ? q[0]! : q;
    expect(single.providerId).toBe('instarem');
    expect(single.dataSource).toBe('wise_comparisons');
    expect(single.rate).toBe(94.5);
  });

  it('throws when both Instarem and Wise comparisons fail', async () => {
    installFetchMock({
      'https://www.instarem.com/api/v1/public/transaction/computed-value': { status: 500 },
      'https://api.wise.com/v3/comparisons/': {
        body: { sourceCurrency: 'USD', targetCurrency: 'INR', sourceAmount: 1000, providers: [] },
      },
    });
    await expect(
      instaremProvider.fetchQuote({ pair: { from: 'USD', to: 'INR' }, sendAmount: 1000 }),
    ).rejects.toThrow();
  });

  it('throws if Instarem direct response is missing fields', async () => {
    installFetchMock({
      'https://www.instarem.com/api/v1/public/transaction/computed-value': {
        body: { success: true, data: {} }, // missing transaction_config.fx_rate
      },
      'https://api.wise.com/v3/comparisons/': {
        body: { sourceCurrency: 'USD', targetCurrency: 'INR', sourceAmount: 1000, providers: [] },
      },
    });
    // Should fall back to Wise comparisons (which is also empty here) and ultimately throw.
    await expect(
      instaremProvider.fetchQuote({ pair: { from: 'USD', to: 'INR' }, sendAmount: 1000 }),
    ).rejects.toThrow();
  });

  it('does not support AED-INR (corridor not offered)', () => {
    expect(instaremProvider.supports({ from: 'USD', to: 'INR' })).toBe(true);
    expect(instaremProvider.supports({ from: 'AED', to: 'INR' })).toBe(false);
    expect(instaremProvider.supports({ from: 'GBP', to: 'INR' })).toBe(false);
  });
});
