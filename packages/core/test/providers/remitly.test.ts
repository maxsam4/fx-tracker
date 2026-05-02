import { describe, it, expect, afterEach, beforeEach } from 'vitest';

import { remitlyProvider } from '../../src/providers/remitly.js';
import { __resetWiseComparisonCache } from '../../src/providers/wiseComparisons.js';
import { installFetchMock, resetFetchMock } from '../helpers/mockFetch.js';
import { readFixtureJson } from '../helpers/fixtures.js';

const wiseFixture = readFixtureJson('providers/wiseComparisons-USD-INR.json');
const wiseEmpty = readFixtureJson('providers/wiseComparisons-AED-INR-empty.json');

const remitlyApiSuccess = {
  estimate: {
    exchange_rate: {
      base_rate: '25.77',
      promotional_exchange_rate: '25.95',
      capped_promotional_exchange_rate_amount: '4000.00',
    },
    fee: { total_fee_amount: '0.00' },
    receive_amount: '128850.00',
    send_amount: '5000.00',
  },
};

describe('remitlyProvider — resolution order', () => {
  beforeEach(() => __resetWiseComparisonCache());
  afterEach(() => resetFetchMock());

  it('AED-INR uses Remitly API (base_rate is the standard rate)', async () => {
    installFetchMock({
      'https://api.remitly.io/v3/calculator/estimate': { body: remitlyApiSuccess },
    });
    const q = await remitlyProvider.fetchQuote({
      pair: { from: 'AED', to: 'INR' },
      sendAmount: 5000,
    });
    const single = Array.isArray(q) ? q[0]! : q;
    expect(single.providerId).toBe('remitly');
    expect(single.dataSource).toBe('remitly_api');
    expect(single.rate).toBe(25.77);
    expect(single.feeAmount).toBe(0);
  });

  it('USD-INR uses Remitly API as primary path', async () => {
    installFetchMock({
      'https://api.remitly.io/v3/calculator/estimate': {
        body: {
          estimate: {
            exchange_rate: {
              base_rate: '94.65',
              promotional_exchange_rate: '95.19',
              capped_promotional_exchange_rate_amount: '6000.00',
            },
            fee: { total_fee_amount: '0.00' },
          },
        },
      },
    });
    const q = await remitlyProvider.fetchQuote({
      pair: { from: 'USD', to: 'INR' },
      sendAmount: 1000,
    });
    const single = Array.isArray(q) ? q[0]! : q;
    expect(single.dataSource).toBe('remitly_api');
    expect(single.rate).toBe(94.65);
  });

  it('falls back to Wise comparisons when Remitly API returns malformed data', async () => {
    installFetchMock({
      'https://api.remitly.io/v3/calculator/estimate': { body: { estimate: {} } },
      'https://api.wise.com/v3/comparisons/': { body: wiseFixture },
    });
    const q = await remitlyProvider.fetchQuote({
      pair: { from: 'USD', to: 'INR' },
      sendAmount: 1000,
    });
    const single = Array.isArray(q) ? q[0]! : q;
    expect(single.dataSource).toBe('wise_comparisons');
    expect(single.rate).toBe(94.2);
  });

  it('throws (no silent promo) when Remitly API fails and Wise returns empty for AED-INR', async () => {
    installFetchMock({
      'https://api.remitly.io/v3/calculator/estimate': { status: 500 },
      'https://api.wise.com/v3/comparisons/': { body: wiseEmpty },
    });
    await expect(
      remitlyProvider.fetchQuote({ pair: { from: 'AED', to: 'INR' }, sendAmount: 5000 }),
    ).rejects.toThrow();
  });

  it('rejects an out-of-range base_rate so a malfunctioning API doesn\'t corrupt data', async () => {
    installFetchMock({
      'https://api.remitly.io/v3/calculator/estimate': {
        body: {
          estimate: {
            exchange_rate: { base_rate: '1.23' }, // implausibly low
            fee: { total_fee_amount: '0' },
          },
        },
      },
      'https://api.wise.com/v3/comparisons/': { body: wiseEmpty },
    });
    await expect(
      remitlyProvider.fetchQuote({ pair: { from: 'AED', to: 'INR' }, sendAmount: 5000 }),
    ).rejects.toThrow();
  });

  it('declares supports correctly', () => {
    expect(remitlyProvider.supports({ from: 'USD', to: 'INR' })).toBe(true);
    expect(remitlyProvider.supports({ from: 'AED', to: 'INR' })).toBe(true);
    expect(remitlyProvider.supports({ from: 'GBP', to: 'INR' })).toBe(false);
  });
});
