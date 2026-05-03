import { describe, it, expect, afterEach } from 'vitest';
import { frankfurterSource } from '../../src/providers/reference/frankfurter.js';
import { installFetchMock, resetFetchMock } from '../helpers/mockFetch.js';

const ENDPOINT = 'https://api.frankfurter.dev/v1/latest';

describe('frankfurterSource.fetchRate', () => {
  afterEach(() => resetFetchMock());

  it('parses USD-INR happy path', async () => {
    installFetchMock({
      [ENDPOINT]: { body: { amount: 1.0, base: 'USD', date: '2026-04-30', rates: { INR: 94.92 } } },
    });
    const r = await frankfurterSource.fetchRate({ pair: { from: 'USD', to: 'INR' } });
    expect(r.sourceId).toBe('frankfurter');
    expect(r.rate).toBe(94.92);
    expect(r.pair).toEqual({ from: 'USD', to: 'INR' });
  });

  it('throws when ECB does not support the source currency (e.g. AED)', async () => {
    installFetchMock({
      [ENDPOINT]: { body: { message: 'not found' } },
    });
    await expect(
      frankfurterSource.fetchRate({ pair: { from: 'AED', to: 'INR' } }),
    ).rejects.toThrow(/not found|unsupported/i);
  });

  it('throws when target currency is missing from rates', async () => {
    installFetchMock({
      [ENDPOINT]: { body: { amount: 1.0, base: 'USD', date: '2026-04-30', rates: {} } },
    });
    await expect(
      frankfurterSource.fetchRate({ pair: { from: 'USD', to: 'INR' } }),
    ).rejects.toThrow(/missing or invalid/i);
  });

  it('throws when rate is non-numeric', async () => {
    installFetchMock({
      [ENDPOINT]: { body: { amount: 1, base: 'USD', rates: { INR: 0 } } },
    });
    await expect(
      frankfurterSource.fetchRate({ pair: { from: 'USD', to: 'INR' } }),
    ).rejects.toThrow(/missing or invalid/i);
  });
});
