import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { remitlyProvider } from '../../src/providers/remitly.js';
import { xoomProvider } from '../../src/providers/xoom.js';
import { westernUnionProvider } from '../../src/providers/westernUnion.js';
import { __resetWiseComparisonCache } from '../../src/providers/wiseComparisons.js';
import { installFetchMock, resetFetchMock } from '../helpers/mockFetch.js';
import { readFixtureJson } from '../helpers/fixtures.js';

const wiseFixture = readFixtureJson('providers/wiseComparisons-USD-INR.json');

// Validates that providers backed by Wise's comparison endpoint extract their
// own row correctly. (The actual scraping of westernUnion is via Playwright
// and tested separately.)

describe('remittance providers via Wise comparisons', () => {
  beforeEach(() => __resetWiseComparisonCache());
  afterEach(() => resetFetchMock());

  it('remitly falls back to Wise comparisons when own page is unavailable', async () => {
    // Remitly now tries its own SSR page first; only when that fails do we
    // hit Wise comparisons. Unmocked Remitly URL returns 599, triggering the
    // fallback path.
    installFetchMock({
      'https://api.wise.com/v3/comparisons/': { body: wiseFixture },
    });
    const q = await remitlyProvider.fetchQuote({
      pair: { from: 'USD', to: 'INR' },
      sendAmount: 1000,
    });
    const single = Array.isArray(q) ? q[0]! : q;
    expect(single.providerId).toBe('remitly');
    expect(single.rate).toBe(94.2);
    expect(single.dataSource).toBe('wise_comparisons');
  });

  it('xoom extracts its own row (alias matching)', async () => {
    installFetchMock({
      'https://api.wise.com/v3/comparisons/': { body: wiseFixture },
    });
    const q = await xoomProvider.fetchQuote({
      pair: { from: 'USD', to: 'INR' },
      sendAmount: 1000,
    });
    const single = Array.isArray(q) ? q[0]! : q;
    expect(single.providerId).toBe('xoom');
    expect(single.rate).toBe(93.6);
  });
});

describe('westernUnionProvider patterns', () => {
  it('declares supported pairs', () => {
    expect(westernUnionProvider.supports({ from: 'USD', to: 'INR' })).toBe(true);
    expect(westernUnionProvider.supports({ from: 'AED', to: 'INR' })).toBe(true);
    expect(westernUnionProvider.supports({ from: 'JPY', to: 'INR' })).toBe(false);
  });
});
