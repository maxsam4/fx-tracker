import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { wiseMidMarketSource } from '../../src/providers/reference/wiseMidMarket.js';
import { exchangerateHostSource } from '../../src/providers/reference/exchangerateHost.js';
import { xeSource } from '../../src/providers/reference/xe.js';
import { installFetchMock, resetFetchMock } from '../helpers/mockFetch.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readFixture = (rel: string): string =>
  fs.readFileSync(path.join(__dirname, '..', 'fixtures', rel), 'utf8');
const wiseLive = JSON.parse(readFixture('reference/wise-rates-live-USD-INR.json'));
const openErApi = JSON.parse(readFixture('reference/openErApi-USD.json'));
const xeUSDINRHtml = readFixture('reference/xe-USD-INR.html');
const xeAEDINRHtml = readFixture('reference/xe-AED-INR.html');
const xeLiveUSDINR = JSON.parse(readFixture('reference/xe-live-USD-INR.json'));
const xeLiveAEDINR = JSON.parse(readFixture('reference/xe-live-AED-INR.json'));

const XE_API = 'https://www.xe.com/api/protected/live-currency-pairs-rates/';
const XE_HTML = 'https://www.xe.com/currencyconverter/convert/';

describe('wiseMidMarketSource', () => {
  afterEach(() => resetFetchMock());

  it('parses live rate response', async () => {
    installFetchMock({ 'https://wise.com/rates/live': { body: wiseLive } });
    const r = await wiseMidMarketSource.fetchRate({ pair: { from: 'USD', to: 'INR' } });
    expect(r.sourceId).toBe('wiseMidMarket');
    expect(r.rate).toBe(94.9711);
  });

  it('throws if value is missing', async () => {
    installFetchMock({ 'https://wise.com/rates/live': { body: { source: 'USD', target: 'INR' } } });
    await expect(
      wiseMidMarketSource.fetchRate({ pair: { from: 'USD', to: 'INR' } }),
    ).rejects.toThrow();
  });

  it('throws on HTTP error', async () => {
    installFetchMock({ 'https://wise.com/rates/live': { status: 500, text: 'oops' } });
    await expect(
      wiseMidMarketSource.fetchRate({ pair: { from: 'USD', to: 'INR' } }),
    ).rejects.toThrow();
  });
});

describe('exchangerateHostSource (open.er-api.com)', () => {
  afterEach(() => resetFetchMock());

  it('extracts the rate and uses the upstream republish timestamp as capturedAt', async () => {
    installFetchMock({ 'https://open.er-api.com/v6/latest/USD': { body: openErApi } });
    const r = await exchangerateHostSource.fetchRate({ pair: { from: 'USD', to: 'INR' } });
    expect(r.rate).toBe(94.941093);
    expect(r.sourceId).toBe('exchangerateHost');
    // 1777478401 is the fixture's `time_last_update_unix`. capturedAt
    // must match that, NOT the fetch wall-clock — the free tier only
    // refreshes daily and downstream dedup relies on this.
    expect(r.capturedAt.getTime()).toBe(1777478401 * 1000);
  });

  it('falls back to wall-clock capturedAt when timestamp absent', async () => {
    installFetchMock({
      'https://open.er-api.com/v6/latest/USD': {
        body: { result: 'success', rates: { INR: 95.0 } },
      },
    });
    const before = Date.now();
    const r = await exchangerateHostSource.fetchRate({ pair: { from: 'USD', to: 'INR' } });
    expect(r.rate).toBe(95.0);
    expect(r.capturedAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('throws when target currency is absent', async () => {
    installFetchMock({
      'https://open.er-api.com/v6/latest/USD': {
        body: { result: 'success', rates: { EUR: 0.92 } },
      },
    });
    await expect(
      exchangerateHostSource.fetchRate({ pair: { from: 'USD', to: 'INR' } }),
    ).rejects.toThrow(/missing rate for INR/);
  });

  it('throws on result=error', async () => {
    installFetchMock({
      'https://open.er-api.com/v6/latest/USD': {
        body: { result: 'error', rates: {} },
      },
    });
    await expect(
      exchangerateHostSource.fetchRate({ pair: { from: 'USD', to: 'INR' } }),
    ).rejects.toThrow();
  });
});

describe('xeSource', () => {
  afterEach(() => resetFetchMock());

  it('uses the per-pair JSON API for USD-INR (preferred path)', async () => {
    installFetchMock({ [XE_API]: { body: xeLiveUSDINR } });
    const r = await xeSource.fetchRate({ pair: { from: 'USD', to: 'INR' } });
    expect(r.sourceId).toBe('xe');
    expect(r.rate).toBe(95.0829425312);
    expect((r.raw as { via?: string }).via).toBe('api');
  });

  it('uses the per-pair JSON API for AED-INR — direct, NOT computed from USD cross', async () => {
    installFetchMock({ [XE_API]: { body: xeLiveAEDINR } });
    const r = await xeSource.fetchRate({ pair: { from: 'AED', to: 'INR' } });
    // The fixture has AED-INR=25.890522, sourced directly from the live
    // pair endpoint. Critically, this is NOT (USD-INR / USD-AED) — the
    // pair-specific endpoint avoids the AED-USD peg drift.
    expect(r.rate).toBe(25.890522132389382);
  });

  it('falls back to HTML when the API returns 401 (e.g. credential rotated)', async () => {
    installFetchMock({
      [XE_API]: { status: 401, text: 'Authorization header was missing' },
      [XE_HTML]: { contentType: 'text/html', text: xeUSDINRHtml },
    });
    const r = await xeSource.fetchRate({ pair: { from: 'USD', to: 'INR' } });
    expect(r.rate).toBe(94.9759);
    expect((r.raw as { via?: string }).via).toBe('html');
  });

  it('falls back to HTML when API returns wrong shape', async () => {
    installFetchMock({
      [XE_API]: { body: [] },
      [XE_HTML]: { contentType: 'text/html', text: xeAEDINRHtml },
    });
    const r = await xeSource.fetchRate({ pair: { from: 'AED', to: 'INR' } });
    expect(r.rate).toBe(25.8513);
  });

  it('throws on unsupported pair without retrying', async () => {
    await expect(
      xeSource.fetchRate({ pair: { from: 'JPY', to: 'INR' } }),
    ).rejects.toThrow(/not configured/);
  });
});
