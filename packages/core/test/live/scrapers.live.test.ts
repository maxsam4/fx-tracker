/**
 * Live Playwright-driven tests for scrape-based providers + reference sources.
 *
 *   FX_LIVE_SCRAPE=1            — required-pass tier (Google Finance only)
 *   FX_LIVE_SCRAPE_FRAGILE=1    — advisory tier (masarif/lulu/careem/wu/rf)
 *
 * The advisory tier scrapers are documented as best-effort in providers.yml.
 * Their failures here mean exactly what they mean in production: that
 * provider records status='error' in provider_runs and the system continues
 * to function on the API-backed providers.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { masarifProvider } from '../../src/providers/masarif.js';
import { luluProvider } from '../../src/providers/lulu.js';
import { careemPayProvider } from '../../src/providers/careemPay.js';
import { remitfinderProvider } from '../../src/providers/remitfinder.js';
import { westernUnionProvider } from '../../src/providers/westernUnion.js';
import { googleFinanceSource } from '../../src/providers/reference/googleFinance.js';
import { shutdownBrowser } from '../../src/scrape/browserPool.js';

const requiredOn = process.env.FX_LIVE_SCRAPE === '1';
const advisoryOn = process.env.FX_LIVE_SCRAPE_FRAGILE === '1';
const dRequired = requiredOn ? describe : describe.skip;
const dAdvisory = advisoryOn ? describe : describe.skip;

afterAll(async () => {
  if (requiredOn || advisoryOn) await shutdownBrowser();
});

const AED_INR = { from: 'AED', to: 'INR' } as const;
const USD_INR = { from: 'USD', to: 'INR' } as const;

const aedLo = 18, aedHi = 35;
const usdLo = 60, usdHi = 130;

// ---------- Required tier: must pass ----------
dRequired('LIVE-SCRAPE [required]: Google Finance', () => {
  it('USD-INR rate is in plausible range', async () => {
    const r = await googleFinanceSource.fetchRate({ pair: USD_INR });
    expect(r.sourceId).toBe('googleFinance');
    expect(r.rate).toBeGreaterThan(usdLo);
    expect(r.rate).toBeLessThan(usdHi);
  }, 60_000);

  it('AED-INR rate is in plausible range', async () => {
    const r = await googleFinanceSource.fetchRate({ pair: AED_INR });
    expect(r.rate).toBeGreaterThan(aedLo);
    expect(r.rate).toBeLessThan(aedHi);
  }, 60_000);
});

// ---------- Advisory tier: may fail ----------
dAdvisory('LIVE-SCRAPE [advisory]: AED-INR scrape providers', () => {
  it('masarif aggregator', async () => {
    const result = await masarifProvider.fetchQuote({ pair: AED_INR, sendAmount: 5000 });
    const quotes = Array.isArray(result) ? result : [result];
    expect(quotes.length).toBeGreaterThan(0);
    for (const q of quotes) {
      expect(q.rate).toBeGreaterThan(aedLo);
      expect(q.rate).toBeLessThan(aedHi);
    }
  }, 60_000);

  it('LuLu Money', async () => {
    const q = await luluProvider.fetchQuote({ pair: AED_INR, sendAmount: 5000 });
    const single = Array.isArray(q) ? q[0]! : q;
    expect(single.rate).toBeGreaterThan(aedLo);
    expect(single.rate).toBeLessThan(aedHi);
  }, 60_000);

  it('Careem Pay', async () => {
    const q = await careemPayProvider.fetchQuote({ pair: AED_INR, sendAmount: 5000 });
    const single = Array.isArray(q) ? q[0]! : q;
    expect(single.rate).toBeGreaterThan(aedLo);
    expect(single.rate).toBeLessThan(aedHi);
  }, 60_000);
});

dAdvisory('LIVE-SCRAPE [advisory]: aggregators + WU', () => {
  it('Remitfinder USD-INR', async () => {
    const result = await remitfinderProvider.fetchQuote({ pair: USD_INR, sendAmount: 1000 });
    const quotes = Array.isArray(result) ? result : [result];
    for (const q of quotes) {
      expect(q.rate).toBeGreaterThan(usdLo);
      expect(q.rate).toBeLessThan(usdHi);
    }
  }, 60_000);

  it('Western Union USD-INR', async () => {
    const q = await westernUnionProvider.fetchQuote({ pair: USD_INR, sendAmount: 1000 });
    const single = Array.isArray(q) ? q[0]! : q;
    expect(single.rate).toBeGreaterThan(usdLo);
    expect(single.rate).toBeLessThan(usdHi);
  }, 60_000);
});
