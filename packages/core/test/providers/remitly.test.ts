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
import { readFixtureJson } from '../helpers/fixtures.js';

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

  it('AED-INR throws when Wise returns empty AND Playwright is unavailable (no silent promo)', async () => {
    // Wise comparisons returns no providers for AED-INR; the calculator path
    // (Playwright) is mocked to fail. Per the design, we MUST throw rather
    // than silently return a promo rate, since promo > mid would mislead
    // the user.
    installFetchMock({
      'https://api.wise.com/v3/comparisons/': { body: wiseEmpty },
    });
    await expect(
      remitlyProvider.fetchQuote({ pair: { from: 'AED', to: 'INR' }, sendAmount: 5000 }),
    ).rejects.toThrow();
  });

  it('throws for USD-INR when Wise comparisons fails AND Playwright is unavailable', async () => {
    installFetchMock({
      'https://api.wise.com/v3/comparisons/': { status: 500 },
    });
    await expect(
      remitlyProvider.fetchQuote({ pair: { from: 'USD', to: 'INR' }, sendAmount: 1000 }),
    ).rejects.toThrow();
  });

  it('declares supports correctly', () => {
    expect(remitlyProvider.supports({ from: 'USD', to: 'INR' })).toBe(true);
    expect(remitlyProvider.supports({ from: 'AED', to: 'INR' })).toBe(true);
    expect(remitlyProvider.supports({ from: 'GBP', to: 'INR' })).toBe(false);
  });
});
