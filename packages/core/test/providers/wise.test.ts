import { describe, it, expect, afterEach } from 'vitest';
import { wiseProvider } from '../../src/providers/wise.js';
import { installFetchMock, resetFetchMock } from '../helpers/mockFetch.js';
import { readFixtureJson } from '../helpers/fixtures.js';

const usdQuote = readFixtureJson('providers/wiseQuote-USD-INR.json');
const aedQuote = readFixtureJson('providers/wiseQuote-AED-INR.json');
const usdComparison = readFixtureJson('providers/wiseComparisons-USD-INR.json');

describe('wiseProvider.fetchQuote', () => {
  afterEach(() => resetFetchMock());

  it('extracts Wise quote from /v3/quotes/ for USD-INR', async () => {
    installFetchMock({
      'https://api.wise.com/v3/quotes/': { body: usdQuote },
    });

    const q = await wiseProvider.fetchQuote({ pair: { from: 'USD', to: 'INR' }, sendAmount: 1000 });
    const single = Array.isArray(q) ? q[0]! : q;
    expect(single.providerId).toBe('wise');
    expect(single.dataSource).toBe('wise_quote');
    expect(single.rate).toBeCloseTo(94.8);
    expect(single.feeAmount).toBeCloseTo(4.5); // cheapest non-disabled option wins
    expect(single.receiveAmount).toBeCloseTo(94778.5);
    expect(single.sendAmount).toBe(1000);
  });

  it('extracts Wise quote from /v3/quotes/ for AED-INR (the corridor /comparisons returns empty for)', async () => {
    installFetchMock({
      'https://api.wise.com/v3/quotes/': { body: aedQuote },
    });

    const q = await wiseProvider.fetchQuote({ pair: { from: 'AED', to: 'INR' }, sendAmount: 5000 });
    const single = Array.isArray(q) ? q[0]! : q;
    expect(single.providerId).toBe('wise');
    expect(single.dataSource).toBe('wise_quote');
    expect(single.rate).toBeCloseTo(25.8413);
    // All options disabled in this corridor — still pick the cheapest one.
    expect(single.feeAmount).toBeCloseTo(49.23);
    expect(single.receiveAmount).toBeCloseTo(127934.33);
  });

  it('falls back to /v3/comparisons/ when /v3/quotes/ fails', async () => {
    installFetchMock({
      'https://api.wise.com/v3/quotes/': { status: 500, text: 'boom' },
      'https://api.wise.com/v3/comparisons/': { body: usdComparison },
    });
    const q = await wiseProvider.fetchQuote({ pair: { from: 'USD', to: 'INR' }, sendAmount: 1000 });
    const single = Array.isArray(q) ? q[0]! : q;
    expect(single.providerId).toBe('wise');
    expect(single.dataSource).toBe('wise_api');
    expect(single.rate).toBeCloseTo(94.8);
  });

  it('reports the original error when both endpoints fail', async () => {
    installFetchMock({
      'https://api.wise.com/v3/quotes/': { status: 500, text: 'boom' },
      'https://api.wise.com/v3/comparisons/': { status: 500, text: 'also boom' },
    });
    await expect(
      wiseProvider.fetchQuote({ pair: { from: 'USD', to: 'INR' }, sendAmount: 1000 }),
    ).rejects.toThrow(/HTTP 500/);
  });

  it('supports declared pairs and rejects others', () => {
    expect(wiseProvider.supports({ from: 'USD', to: 'INR' })).toBe(true);
    expect(wiseProvider.supports({ from: 'AED', to: 'INR' })).toBe(true);
    expect(wiseProvider.supports({ from: 'JPY', to: 'INR' })).toBe(false);
    expect(wiseProvider.supports({ from: 'USD', to: 'JPY' })).toBe(false);
  });
});
