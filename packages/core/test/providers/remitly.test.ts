import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';

// Stub the browserPool BEFORE importing the plugin so its Playwright path
// fails fast without launching Chromium during unit tests.
vi.mock('../../src/scrape/browserPool.js', () => ({
  withPage: vi.fn(async () => {
    throw new Error('Playwright disabled in unit tests');
  }),
  shutdownBrowser: vi.fn(),
}));

import { remitlyProvider } from '../../src/providers/remitly.js';
import { __resetWiseComparisonCache } from '../../src/providers/wiseComparisons.js';
import { installFetchMock, resetFetchMock } from '../helpers/mockFetch.js';
import { readFixtureText, readFixtureJson } from '../helpers/fixtures.js';

const usdHtml = readFixtureText('providers/remitly-USD-INR-page.html');
const aedHtml = readFixtureText('providers/remitly-AED-INR-page.html');
const wiseFixture = readFixtureJson('providers/wiseComparisons-USD-INR.json');
const wiseEmpty = readFixtureJson('providers/wiseComparisons-AED-INR-empty.json');

describe('remitlyProvider — resolution order', () => {
  beforeEach(() => __resetWiseComparisonCache());
  afterEach(() => resetFetchMock());

  it('USD-INR uses Wise comparisons (standard rate) as primary path', async () => {
    installFetchMock({
      'https://api.wise.com/v3/comparisons/': { body: wiseFixture },
    });
    const q = await remitlyProvider.fetchQuote({
      pair: { from: 'USD', to: 'INR' },
      sendAmount: 1000,
    });
    const single = Array.isArray(q) ? q[0]! : q;
    expect(single.providerId).toBe('remitly');
    expect(single.dataSource).toBe('wise_comparisons');
    expect(single.rate).toBe(94.2);
  });

  it('AED-INR falls past Wise (returns empty providers); plain HTTP promo is the unit-test-reachable fallback', async () => {
    // Playwright is not available in unit tests; route to the final fallback
    // (plain HTTP promo from SSR HTML) to verify it works.
    installFetchMock({
      'https://api.wise.com/v3/comparisons/': { body: wiseEmpty },
      'https://www.remitly.com/ae/en/currency-converter/aed-to-inr-rate': {
        contentType: 'text/html',
        text: aedHtml,
      },
    });
    const q = await remitlyProvider.fetchQuote({
      pair: { from: 'AED', to: 'INR' },
      sendAmount: 5000,
    });
    const single = Array.isArray(q) ? q[0]! : q;
    expect(single.providerId).toBe('remitly');
    // Either Playwright (skipped in unit tests) or plain HTTP promo.
    expect(['remitly_standard', 'remitly_promo']).toContain(single.dataSource);
    expect(single.rate).toBeGreaterThan(18);
    expect(single.rate).toBeLessThan(35);
  });

  it('throws when every fallback fails', async () => {
    installFetchMock({
      'https://api.wise.com/v3/comparisons/': { status: 500 },
      'https://www.remitly.com/us/en/currency-converter/usd-to-inr-rate': { status: 500 },
    });
    await expect(
      remitlyProvider.fetchQuote({ pair: { from: 'USD', to: 'INR' }, sendAmount: 1000 }),
    ).rejects.toThrow();
  });

  it('falls back to plain HTTP promo when Wise comparisons returns empty for USD-INR', async () => {
    installFetchMock({
      'https://api.wise.com/v3/comparisons/': {
        body: { sourceCurrency: 'USD', targetCurrency: 'INR', sourceAmount: 1000, providers: [] },
      },
      'https://www.remitly.com/us/en/currency-converter/usd-to-inr-rate': {
        contentType: 'text/html',
        text: usdHtml,
      },
    });
    const q = await remitlyProvider.fetchQuote({
      pair: { from: 'USD', to: 'INR' },
      sendAmount: 1000,
    });
    const single = Array.isArray(q) ? q[0]! : q;
    expect(single.providerId).toBe('remitly');
    expect(['remitly_standard', 'remitly_promo']).toContain(single.dataSource);
    expect(single.rate).toBeGreaterThan(60);
    expect(single.rate).toBeLessThan(130);
  });

  it('declares supports correctly', () => {
    expect(remitlyProvider.supports({ from: 'USD', to: 'INR' })).toBe(true);
    expect(remitlyProvider.supports({ from: 'AED', to: 'INR' })).toBe(true);
    expect(remitlyProvider.supports({ from: 'GBP', to: 'INR' })).toBe(false);
  });
});
