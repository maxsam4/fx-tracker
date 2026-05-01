import { describe, it, expect, afterEach } from 'vitest';
import { wiseProvider } from '../../src/providers/wise.js';
import { installFetchMock, resetFetchMock } from '../helpers/mockFetch.js';
import { readFixtureJson } from '../helpers/fixtures.js';

const fixture = readFixtureJson<{
  providers: Array<{
    name: string;
    alias: string;
    quotes: Array<{
      rate: number;
      fee: number;
      sourceAmount: number;
      targetAmount: number;
      receivedAmount?: number;
    }>;
  }>;
}>('providers/wiseComparisons-USD-INR.json');
const emptyFixture = readFixtureJson('providers/wiseComparisons-AED-INR-empty.json');

describe('wiseProvider.fetchQuote', () => {
  afterEach(() => resetFetchMock());

  it('extracts the Wise entry from a comparison response', async () => {
    installFetchMock({
      'https://api.wise.com/v3/comparisons/': { body: fixture },
    });

    const q = await wiseProvider.fetchQuote({
      pair: { from: 'USD', to: 'INR' },
      sendAmount: 1000,
    });
    expect(Array.isArray(q)).toBe(false);
    const single = Array.isArray(q) ? q[0]! : q;
    expect(single.providerId).toBe('wise');
    expect(single.dataSource).toBe('wise_api');
    expect(single.rate).toBeCloseTo(94.8);
    expect(single.feeAmount).toBeCloseTo(4.5);
    expect(single.receiveAmount).toBeCloseTo(94778.5);
    expect(single.sendAmount).toBe(1000);
  });

  it('throws clearly when Wise is not in the response', async () => {
    installFetchMock({
      'https://api.wise.com/v3/comparisons/': { body: emptyFixture },
    });
    await expect(
      wiseProvider.fetchQuote({ pair: { from: 'AED', to: 'INR' }, sendAmount: 5000 }),
    ).rejects.toThrow(/Wise not found/i);
  });

  it('uses receivedAmount when present, falls back to targetAmount', async () => {
    const noReceived = {
      ...fixture,
      providers: [
        {
          name: 'Wise',
          alias: 'wise',
          quotes: [{ rate: 90, fee: 0, sourceAmount: 1000, targetAmount: 90000 }],
        },
      ],
    };
    installFetchMock({
      'https://api.wise.com/v3/comparisons/': { body: noReceived },
    });
    const q = await wiseProvider.fetchQuote({
      pair: { from: 'USD', to: 'INR' },
      sendAmount: 1000,
    });
    const single = Array.isArray(q) ? q[0]! : q;
    expect(single.receiveAmount).toBe(90000);
  });

  it('reports network errors', async () => {
    installFetchMock({
      'https://api.wise.com/v3/comparisons/': { status: 500, text: 'boom' },
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
