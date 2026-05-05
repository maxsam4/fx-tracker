import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { wiseMidMarketSource } from '../../src/providers/reference/wiseMidMarket.js';
import { exchangerateHostSource } from '../../src/providers/reference/exchangerateHost.js';
import { xeSource } from '../../src/providers/reference/xe.js';
import { twelveDataSource } from '../../src/providers/reference/twelveData.js';
import { revolutSource } from '../../src/providers/reference/revolut.js';
import { yahooFinanceSource } from '../../src/providers/reference/yahooFinance.js';
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

describe('twelveDataSource', () => {
  const ENV_KEY = 'TWELVE_DATA_API_KEY';
  const original = process.env[ENV_KEY];
  afterEach(() => {
    resetFetchMock();
    if (original === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = original;
  });

  it('throws when API key is unset (so source skips quietly in median)', async () => {
    delete process.env[ENV_KEY];
    await expect(
      twelveDataSource.fetchRate({ pair: { from: 'USD', to: 'INR' } }),
    ).rejects.toThrow(/TWELVE_DATA_API_KEY not set/);
  });

  it('parses a successful exchange_rate response', async () => {
    process.env[ENV_KEY] = 'test-key';
    installFetchMock({
      'https://api.twelvedata.com/exchange_rate': {
        body: { symbol: 'USD/INR', rate: 95.14452, timestamp: 1777997820 },
      },
    });
    const r = await twelveDataSource.fetchRate({ pair: { from: 'USD', to: 'INR' } });
    expect(r.sourceId).toBe('twelveData');
    expect(r.rate).toBe(95.14452);
    expect(r.capturedAt.getTime()).toBe(1777997820 * 1000);
  });

  it('throws on error-status response (e.g. 401 / quota)', async () => {
    process.env[ENV_KEY] = 'test-key';
    installFetchMock({
      'https://api.twelvedata.com/exchange_rate': {
        body: { status: 'error', code: 401, message: 'apikey is incorrect' },
      },
    });
    await expect(
      twelveDataSource.fetchRate({ pair: { from: 'USD', to: 'INR' } }),
    ).rejects.toThrow(/apikey is incorrect/);
  });
});

describe('revolutSource', () => {
  afterEach(() => resetFetchMock());

  it('returns the latest point from /api/exchange/fx-charts/<PAIR>', async () => {
    installFetchMock({
      'https://www.revolut.com/api/exchange/fx-charts/USDINR': {
        body: {
          previousRangeCloseRate: '95.0000',
          points: [
            { start: 1777993500000, rate: '95.05' },
            { start: 1777993800000, rate: '95.0729' }, // latest
          ],
        },
      },
    });
    const r = await revolutSource.fetchRate({ pair: { from: 'USD', to: 'INR' } });
    expect(r.sourceId).toBe('revolut');
    expect(r.rate).toBe(95.0729);
    expect(r.capturedAt.getTime()).toBe(1777993800000);
  });

  it('handles AED-INR (concatenated symbol form)', async () => {
    installFetchMock({
      'https://www.revolut.com/api/exchange/fx-charts/AEDINR': {
        body: { points: [{ start: 1777993800000, rate: '25.8835' }] },
      },
    });
    const r = await revolutSource.fetchRate({ pair: { from: 'AED', to: 'INR' } });
    expect(r.rate).toBe(25.8835);
  });

  it('throws when points array is empty', async () => {
    installFetchMock({
      'https://www.revolut.com/api/exchange/fx-charts/USDINR': { body: { points: [] } },
    });
    await expect(
      revolutSource.fetchRate({ pair: { from: 'USD', to: 'INR' } }),
    ).rejects.toThrow(/no chart points/);
  });

  it('throws on unsupported pair', async () => {
    await expect(
      revolutSource.fetchRate({ pair: { from: 'GBP', to: 'INR' } }),
    ).rejects.toThrow(/not configured/);
  });
});

describe('yahooFinanceSource', () => {
  afterEach(() => resetFetchMock());

  it('extracts regularMarketPrice from chart API', async () => {
    installFetchMock({
      'https://query1.finance.yahoo.com/v8/finance/chart/USDINR': {
        body: {
          chart: {
            error: null,
            result: [
              {
                meta: {
                  symbol: 'USDINR=X',
                  regularMarketPrice: 95.27,
                  regularMarketTime: 1777996630,
                  currency: 'INR',
                },
              },
            ],
          },
        },
      },
    });
    const r = await yahooFinanceSource.fetchRate({ pair: { from: 'USD', to: 'INR' } });
    expect(r.sourceId).toBe('yahooFinance');
    expect(r.rate).toBe(95.27);
    expect(r.capturedAt.getTime()).toBe(1777996630 * 1000);
  });

  it('throws when chart.error is set (e.g. datacenter IP block)', async () => {
    installFetchMock({
      'https://query1.finance.yahoo.com/v8/finance/chart/USDINR': {
        body: { chart: { error: { code: 'Unauthorized', description: 'Edge: Unauthorized' } } },
      },
    });
    await expect(
      yahooFinanceSource.fetchRate({ pair: { from: 'USD', to: 'INR' } }),
    ).rejects.toThrow(/chart.error/);
  });

  it('throws on unsupported pair', async () => {
    await expect(
      yahooFinanceSource.fetchRate({ pair: { from: 'EUR', to: 'INR' } }),
    ).rejects.toThrow(/not configured/);
  });
});
