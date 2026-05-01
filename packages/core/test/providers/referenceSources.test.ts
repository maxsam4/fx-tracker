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
const xeUSDINR = readFixture('reference/xe-USD-INR.html');
const xeAEDINR = readFixture('reference/xe-AED-INR.html');

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

  it('extracts the rate for the target currency', async () => {
    installFetchMock({ 'https://open.er-api.com/v6/latest/USD': { body: openErApi } });
    const r = await exchangerateHostSource.fetchRate({ pair: { from: 'USD', to: 'INR' } });
    expect(r.rate).toBe(94.941093);
    expect(r.sourceId).toBe('exchangerateHost');
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

describe('xeSource (HTTP path)', () => {
  afterEach(() => resetFetchMock());

  it('parses USD-INR HTML', async () => {
    installFetchMock({
      'https://www.xe.com/currencyconverter/convert/': { contentType: 'text/html', text: xeUSDINR },
    });
    const r = await xeSource.fetchRate({ pair: { from: 'USD', to: 'INR' } });
    expect(r.rate).toBe(94.9759);
  });

  it('parses AED-INR HTML', async () => {
    installFetchMock({
      'https://www.xe.com/currencyconverter/convert/': { contentType: 'text/html', text: xeAEDINR },
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
