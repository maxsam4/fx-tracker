/**
 * Live integration tests — only run when FX_LIVE=1 is set in the environment.
 * Skipped by default so CI never depends on the network.
 *
 *   FX_LIVE=1 pnpm --filter @fx/core test
 *
 * These tests hit real provider endpoints. Failures here are first-class
 * signals: a provider's API/scrape selectors have drifted and the plugin
 * needs adjusting.
 */
import { describe, it, expect } from 'vitest';
import { wiseProvider } from '../../src/providers/wise.js';
import { remitlyProvider } from '../../src/providers/remitly.js';
import { xoomProvider } from '../../src/providers/xoom.js';
import { instaremProvider } from '../../src/providers/instarem.js';
import { asporaProvider } from '../../src/providers/aspora.js';
import { westernUnionProvider } from '../../src/providers/westernUnion.js';
import { remitfinderProvider } from '../../src/providers/remitfinder.js';
import { wiseMidMarketSource } from '../../src/providers/reference/wiseMidMarket.js';
import { exchangerateHostSource } from '../../src/providers/reference/exchangerateHost.js';
import { xeSource } from '../../src/providers/reference/xe.js';
import { revolutSource } from '../../src/providers/reference/revolut.js';
import { yahooFinanceSource } from '../../src/providers/reference/yahooFinance.js';
import { twelveDataSource } from '../../src/providers/reference/twelveData.js';

const live = process.env.FX_LIVE === '1';
const d = live ? describe : describe.skip;

const USD_INR = { from: 'USD', to: 'INR' } as const;
const AED_INR = { from: 'AED', to: 'INR' } as const;

// Plausible bounds — keep wide so legitimate market movement doesn't break tests.
const usdInrLo = 60, usdInrHi = 130;
const aedInrLo = 18, aedInrHi = 35;

function expectRateInRange(rate: number, lo: number, hi: number, label: string) {
  expect(rate, `${label}: ${rate}`).toBeGreaterThan(lo);
  expect(rate, `${label}: ${rate}`).toBeLessThan(hi);
  expect(Number.isFinite(rate)).toBe(true);
}

d('LIVE: mid-market sources', () => {
  it('Wise mid-market USD-INR', async () => {
    const r = await wiseMidMarketSource.fetchRate({ pair: USD_INR });
    expectRateInRange(r.rate, usdInrLo, usdInrHi, 'wise USD-INR');
    expect(r.sourceId).toBe('wiseMidMarket');
  }, 30_000);

  it('Wise mid-market AED-INR', async () => {
    const r = await wiseMidMarketSource.fetchRate({ pair: AED_INR });
    expectRateInRange(r.rate, aedInrLo, aedInrHi, 'wise AED-INR');
  }, 30_000);

  it('exchangerate-host USD-INR', async () => {
    const r = await exchangerateHostSource.fetchRate({ pair: USD_INR });
    expectRateInRange(r.rate, usdInrLo, usdInrHi, 'open.er-api USD-INR');
  }, 30_000);

  it('exchangerate-host AED-INR', async () => {
    const r = await exchangerateHostSource.fetchRate({ pair: AED_INR });
    expectRateInRange(r.rate, aedInrLo, aedInrHi, 'open.er-api AED-INR');
  }, 30_000);

  it('XE USD-INR', async () => {
    const r = await xeSource.fetchRate({ pair: USD_INR });
    expectRateInRange(r.rate, usdInrLo, usdInrHi, 'xe USD-INR');
  }, 45_000);

  it('XE AED-INR', async () => {
    const r = await xeSource.fetchRate({ pair: AED_INR });
    expectRateInRange(r.rate, aedInrLo, aedInrHi, 'xe AED-INR');
  }, 45_000);

  it('Revolut USD-INR', async () => {
    const r = await revolutSource.fetchRate({ pair: USD_INR });
    expectRateInRange(r.rate, usdInrLo, usdInrHi, 'revolut USD-INR');
    expect(r.sourceId).toBe('revolut');
  }, 30_000);

  it('Revolut AED-INR', async () => {
    const r = await revolutSource.fetchRate({ pair: AED_INR });
    expectRateInRange(r.rate, aedInrLo, aedInrHi, 'revolut AED-INR');
  }, 30_000);

  it('Yahoo Finance USD-INR', async () => {
    const r = await yahooFinanceSource.fetchRate({ pair: USD_INR });
    expectRateInRange(r.rate, usdInrLo, usdInrHi, 'yahoo USD-INR');
    expect(r.sourceId).toBe('yahooFinance');
  }, 30_000);

  it('Yahoo Finance AED-INR', async () => {
    const r = await yahooFinanceSource.fetchRate({ pair: AED_INR });
    expectRateInRange(r.rate, aedInrLo, aedInrHi, 'yahoo AED-INR');
  }, 30_000);

  // Twelve Data is gated on a free API key; skip if unset rather than fail.
  const twelveSkip = process.env.TWELVE_DATA_API_KEY ? it : it.skip;
  twelveSkip('Twelve Data USD-INR', async () => {
    const r = await twelveDataSource.fetchRate({ pair: USD_INR });
    expectRateInRange(r.rate, usdInrLo, usdInrHi, 'twelveData USD-INR');
  }, 30_000);

  twelveSkip('Twelve Data AED-INR', async () => {
    const r = await twelveDataSource.fetchRate({ pair: AED_INR });
    expectRateInRange(r.rate, aedInrLo, aedInrHi, 'twelveData AED-INR');
  }, 30_000);
});

d('LIVE: API-based remittance providers', () => {
  it('Wise USD-INR returns Wise quote', async () => {
    const q = await wiseProvider.fetchQuote({ pair: USD_INR, sendAmount: 1000 });
    const single = Array.isArray(q) ? q[0]! : q;
    expectRateInRange(single.rate, usdInrLo, usdInrHi, 'wise USD-INR quote');
    expect(single.sendAmount).toBe(1000);
    expect(single.receiveAmount).toBeGreaterThan(60_000);
  }, 30_000);

  it('Remitly USD-INR returns standard (non-promo) rate', async () => {
    const q = await remitlyProvider.fetchQuote({ pair: USD_INR, sendAmount: 1000 });
    const single = Array.isArray(q) ? q[0]! : q;
    expect(single.providerId).toBe('remitly');
    expectRateInRange(single.rate, usdInrLo, usdInrHi, 'remitly USD-INR');
    // Standard-rate paths only — primary remitly_api, fallback wise_comparisons.
    expect(['remitly_api', 'wise_comparisons']).toContain(single.dataSource);
  }, 60_000);

  it('Remitly AED-INR returns standard (non-promo) rate', async () => {
    const q = await remitlyProvider.fetchQuote({ pair: AED_INR, sendAmount: 5000 });
    const single = Array.isArray(q) ? q[0]! : q;
    expect(single.providerId).toBe('remitly');
    expectRateInRange(single.rate, aedInrLo, aedInrHi, 'remitly AED-INR');
    // Wise comparisons returns empty for AED-INR — expect remitly_api.
    expect(single.dataSource).toBe('remitly_api');
  }, 60_000);

  it('Xoom USD-INR via Wise comparisons', async () => {
    const q = await xoomProvider.fetchQuote({ pair: USD_INR, sendAmount: 1000 });
    const single = Array.isArray(q) ? q[0]! : q;
    expect(single.providerId).toBe('xoom');
    expectRateInRange(single.rate, usdInrLo, usdInrHi, 'xoom USD-INR');
  }, 30_000);

  it('Instarem USD-INR (direct or fallback)', async () => {
    const q = await instaremProvider.fetchQuote({ pair: USD_INR, sendAmount: 1000 });
    const single = Array.isArray(q) ? q[0]! : q;
    expect(single.providerId).toBe('instarem');
    expectRateInRange(single.rate, usdInrLo, usdInrHi, 'instarem USD-INR');
  }, 30_000);

  it('Aspora USD-INR', async () => {
    const q = await asporaProvider.fetchQuote({ pair: USD_INR, sendAmount: 1000 });
    const single = Array.isArray(q) ? q[0]! : q;
    expect(single.providerId).toBe('aspora');
    expect(single.dataSource).toBe('aspora_api');
    expectRateInRange(single.rate, usdInrLo, usdInrHi, 'aspora USD-INR');
  }, 30_000);

  it('Aspora AED-INR', async () => {
    const q = await asporaProvider.fetchQuote({ pair: AED_INR, sendAmount: 5000 });
    const single = Array.isArray(q) ? q[0]! : q;
    expect(single.providerId).toBe('aspora');
    expectRateInRange(single.rate, aedInrLo, aedInrHi, 'aspora AED-INR');
  }, 30_000);

  it('Western Union USD-INR via prices/catalog', async () => {
    const q = await westernUnionProvider.fetchQuote({ pair: USD_INR, sendAmount: 1000 });
    const single = Array.isArray(q) ? q[0]! : q;
    expect(single.providerId).toBe('westernUnion');
    expect(single.dataSource).toBe('westernunion_api');
    expectRateInRange(single.rate, usdInrLo, usdInrHi, 'wu USD-INR');
  }, 30_000);

  it('Western Union AED-INR via UAE retail catalog', async () => {
    const q = await westernUnionProvider.fetchQuote({ pair: AED_INR, sendAmount: 5000 });
    const single = Array.isArray(q) ? q[0]! : q;
    expect(single.providerId).toBe('westernUnion');
    expect(single.dataSource).toBe('westernunion_api');
    expectRateInRange(single.rate, aedInrLo, aedInrHi, 'wu AED-INR');
  }, 30_000);
});

d('LIVE: Remitfinder aggregator', () => {
  it('USD-INR returns multiple allowlisted providers', async () => {
    const result = await remitfinderProvider.fetchQuote({ pair: USD_INR, sendAmount: 1000 });
    const quotes = Array.isArray(result) ? result : [result];
    expect(quotes.length).toBeGreaterThan(0);
    for (const q of quotes) {
      expect(q.dataSource).toBe('remitfinder');
      expectRateInRange(q.rate, usdInrLo, usdInrHi, `remitfinder USD-INR ${q.providerId}`);
    }
  }, 30_000);

  it('AED-INR returns multiple allowlisted providers', async () => {
    const result = await remitfinderProvider.fetchQuote({ pair: AED_INR, sendAmount: 1000 });
    const quotes = Array.isArray(result) ? result : [result];
    expect(quotes.length).toBeGreaterThan(0);
    for (const q of quotes) {
      expect(q.dataSource).toBe('remitfinder');
      expectRateInRange(q.rate, aedInrLo, aedInrHi, `remitfinder AED-INR ${q.providerId}`);
    }
  }, 30_000);
});
