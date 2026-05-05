import { describe, it, expect, afterEach } from 'vitest';
import { remitfinderProvider } from '../../src/providers/remitfinder.js';
import { installFetchMock, resetFetchMock } from '../helpers/mockFetch.js';
import { readFixtureJson } from '../helpers/fixtures.js';

const usdFixture = readFixtureJson('providers/remitfinder-USD-INR.json');
const aedFixture = readFixtureJson('providers/remitfinder-AED-INR.json');

const USD_INR_API = 'https://www.remitfinder.com/api/v1/rates/USA/IND';
const AED_INR_API = 'https://www.remitfinder.com/api/v1/rates/ARE/IND';

const ALLOWED_IDS = new Set([
  'riaMoneyTransfer',
  'moneyGram',
  'worldRemit',
  'ofx',
  'xeMoneyTransfer',
  'currencyFair',
  'pandaRemit',
  'revolut',
]);

describe('remitfinderProvider.fetchQuote', () => {
  afterEach(() => resetFetchMock());

  it('emits allowlisted providers from USD-INR response', async () => {
    installFetchMock({ [USD_INR_API]: { body: usdFixture } });
    const result = await remitfinderProvider.fetchQuote({
      pair: { from: 'USD', to: 'INR' },
      sendAmount: 1000,
    });
    const arr = Array.isArray(result) ? result : [result];
    expect(arr.length).toBeGreaterThan(0);
    for (const q of arr) {
      expect(ALLOWED_IDS.has(q.providerId)).toBe(true);
      expect(q.dataSource).toBe('remitfinder');
      expect(q.pair).toEqual({ from: 'USD', to: 'INR' });
      expect(q.sendAmount).toBe(1000);
      expect(q.feeAmount).toBe(0);
      expect(q.rate).toBeGreaterThan(60);
      expect(q.rate).toBeLessThan(130);
      expect(q.receiveAmount).toBe(1000 * q.rate);
    }
    // Spot-check a known-good provider from the fixture: MoneyGram has a
    // 0–5000 tier, so a 1000 USD send is in-range.
    const mg = arr.find((q) => q.providerId === 'moneyGram');
    expect(mg?.rate).toBeCloseTo(95.9796, 3);
  });

  it('emits allowlisted providers from AED-INR response', async () => {
    installFetchMock({ [AED_INR_API]: { body: aedFixture } });
    const result = await remitfinderProvider.fetchQuote({
      pair: { from: 'AED', to: 'INR' },
      sendAmount: 1000,
    });
    const arr = Array.isArray(result) ? result : [result];
    expect(arr.length).toBeGreaterThan(0);
    for (const q of arr) {
      expect(ALLOWED_IDS.has(q.providerId)).toBe(true);
      expect(q.rate).toBeGreaterThan(18);
      expect(q.rate).toBeLessThan(35);
    }
  });

  it('drops providers we already integrate directly (wise, remitly, etc.)', async () => {
    installFetchMock({ [USD_INR_API]: { body: usdFixture } });
    const result = await remitfinderProvider.fetchQuote({
      pair: { from: 'USD', to: 'INR' },
      sendAmount: 1000,
    });
    const arr = Array.isArray(result) ? result : [result];
    const ids = arr.map((q) => q.providerId);
    // These all appear in the fixture but are direct-integrated elsewhere —
    // remitfinder must NOT shadow them (see CLAUDE.md note re: Remitly promo).
    expect(ids).not.toContain('wise');
    expect(ids).not.toContain('remitly');
    expect(ids).not.toContain('instarem');
    expect(ids).not.toContain('westernUnion');
    expect(ids).not.toContain('aspora');
  });

  it('drops providers whose tiers do not cover the send amount', async () => {
    installFetchMock({
      [USD_INR_API]: {
        body: {
          latestFxRate: { rate: 95 },
          remitRateResultDTOs: [
            // tier caps at 100 USD → not applicable for a 5000 USD send
            {
              serviceProvider: { name: 'MONEYGRAM', longName: 'MoneyGram' },
              latestRemitRate: {
                tiers: [{ lower: 0, upper: 100, rate: 95.5 }],
              },
            },
            // open-ended tier → applicable
            {
              serviceProvider: { name: 'OFX', longName: 'OFX' },
              latestRemitRate: {
                tiers: [{ lower: null, upper: null, rate: 94.5 }],
              },
            },
          ],
        },
      },
    });
    const result = await remitfinderProvider.fetchQuote({
      pair: { from: 'USD', to: 'INR' },
      sendAmount: 5000,
    });
    const arr = Array.isArray(result) ? result : [result];
    const ids = arr.map((q) => q.providerId);
    expect(ids).toEqual(['ofx']);
  });

  it('throws when no allowlisted provider survives the filter', async () => {
    installFetchMock({
      [USD_INR_API]: {
        body: {
          latestFxRate: { rate: 95 },
          remitRateResultDTOs: [
            {
              serviceProvider: { name: 'TRANSFERWISE', longName: 'Wise' },
              latestRemitRate: {
                tiers: [{ lower: null, upper: null, rate: 94.3 }],
              },
            },
          ],
        },
      },
    });
    await expect(
      remitfinderProvider.fetchQuote({ pair: { from: 'USD', to: 'INR' }, sendAmount: 1000 }),
    ).rejects.toThrow(/no allowlisted/i);
  });

  it('drops out-of-range rates as a sanity check (e.g. inverse rate)', async () => {
    installFetchMock({
      [USD_INR_API]: {
        body: {
          latestFxRate: { rate: 95 },
          remitRateResultDTOs: [
            {
              serviceProvider: { name: 'OFX', longName: 'OFX' },
              latestRemitRate: {
                tiers: [{ lower: null, upper: null, rate: 0.0105 }],
              },
            },
            {
              serviceProvider: { name: 'MONEYGRAM', longName: 'MoneyGram' },
              latestRemitRate: {
                tiers: [{ lower: null, upper: null, rate: 95.9 }],
              },
            },
          ],
        },
      },
    });
    const result = await remitfinderProvider.fetchQuote({
      pair: { from: 'USD', to: 'INR' },
      sendAmount: 1000,
    });
    const arr = Array.isArray(result) ? result : [result];
    expect(arr.map((q) => q.providerId)).toEqual(['moneyGram']);
  });

  it('signs the request with the documented header set', async () => {
    const { calls } = installFetchMock({ [USD_INR_API]: { body: usdFixture } });
    await remitfinderProvider.fetchQuote({
      pair: { from: 'USD', to: 'INR' },
      sendAmount: 1000,
    });
    expect(calls.length).toBe(1);
    const headers = (calls[0]!.init?.headers ?? {}) as Record<string, string>;
    expect(headers.ai).toBe('WBST');
    expect(headers.av).toBe('1.0.1');
    expect(headers.ts).toMatch(/^\d{13}$/);
    // base64-encoded ASCII of a 64-char sha256 hex string => 88 chars w/ '='.
    expect(headers.as).toMatch(/^[A-Za-z0-9+/]{86}==$/);
  });

  it('declares supports correctly', () => {
    expect(remitfinderProvider.supports({ from: 'USD', to: 'INR' })).toBe(true);
    expect(remitfinderProvider.supports({ from: 'AED', to: 'INR' })).toBe(true);
    expect(remitfinderProvider.supports({ from: 'GBP', to: 'INR' })).toBe(false);
    expect(remitfinderProvider.supports({ from: 'USD', to: 'EUR' })).toBe(false);
  });
});
