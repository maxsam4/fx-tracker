import { describe, it, expect, vi } from 'vitest';

// Visa drives through Playwright (the cmsapi/fx/rates endpoint sits behind
// Cloudflare turnstile). Mock withPage to return whatever the test feeds in.
const VISA_BODY_USD_INR = JSON.stringify({
  originalValues: {
    fromCurrency: 'USD',
    toCurrency: 'INR',
    fxRateVisa: '94.91990508',
    lastUpdatedVisaRate: 1777679425,
  },
});

vi.mock('../../src/scrape/browserPool.js', () => ({
  withPage: vi.fn(async (fn: (page: unknown) => Promise<unknown>) => {
    const page = {
      goto: vi.fn(async () => undefined),
      evaluate: vi.fn(async () => VISA_BODY_USD_INR),
    };
    return fn(page);
  }),
  shutdownBrowser: vi.fn(),
}));

import { visaSource } from '../../src/providers/reference/visa.js';

describe('visaSource.fetchRate', () => {
  it('parses fxRateVisa and uses lastUpdatedVisaRate (seconds) as capturedAt', async () => {
    const r = await visaSource.fetchRate({ pair: { from: 'USD', to: 'INR' } });
    expect(r.sourceId).toBe('visa');
    expect(r.rate).toBeCloseTo(94.91990508, 6);
    expect(r.pair).toEqual({ from: 'USD', to: 'INR' });
    // 1777679425 < 1e12 → treated as Unix seconds × 1000.
    expect(r.capturedAt.getTime()).toBe(1777679425 * 1000);
  });

  it('treats lastUpdatedVisaRate >1e12 as milliseconds', async () => {
    const { withPage } = await import('../../src/scrape/browserPool.js');
    (withPage as ReturnType<typeof vi.fn>).mockImplementationOnce(async (fn: any) =>
      fn({
        goto: vi.fn(),
        evaluate: vi.fn(async () =>
          JSON.stringify({
            originalValues: { fxRateVisa: '94.5', lastUpdatedVisaRate: 1777679425000 },
          }),
        ),
      }),
    );
    const r = await visaSource.fetchRate({ pair: { from: 'USD', to: 'INR' } });
    expect(r.capturedAt.getTime()).toBe(1777679425000);
  });

  it('falls back to wall-clock when lastUpdatedVisaRate is absent', async () => {
    const { withPage } = await import('../../src/scrape/browserPool.js');
    (withPage as ReturnType<typeof vi.fn>).mockImplementationOnce(async (fn: any) =>
      fn({
        goto: vi.fn(),
        evaluate: vi.fn(async () =>
          JSON.stringify({ originalValues: { fxRateVisa: '94.5' } }),
        ),
      }),
    );
    const before = Date.now();
    const r = await visaSource.fetchRate({ pair: { from: 'USD', to: 'INR' } });
    expect(r.capturedAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('throws when the body is not parseable JSON (likely Cloudflare interstitial)', async () => {
    const { withPage } = await import('../../src/scrape/browserPool.js');
    (withPage as ReturnType<typeof vi.fn>).mockImplementationOnce(async (fn: any) =>
      fn({
        goto: vi.fn(),
        evaluate: vi.fn(async () => '<html>Just a moment...</html>'),
      }),
    );
    await expect(
      visaSource.fetchRate({ pair: { from: 'USD', to: 'INR' } }),
    ).rejects.toThrow(/not JSON|cloudflare/i);
  });

  it('throws when fxRateVisa is missing or invalid', async () => {
    const { withPage } = await import('../../src/scrape/browserPool.js');
    (withPage as ReturnType<typeof vi.fn>).mockImplementationOnce(async (fn: any) =>
      fn({
        goto: vi.fn(),
        evaluate: vi.fn(async () =>
          JSON.stringify({ originalValues: { fxRateVisa: 'not-a-number' } }),
        ),
      }),
    );
    await expect(
      visaSource.fetchRate({ pair: { from: 'USD', to: 'INR' } }),
    ).rejects.toThrow(/invalid/i);
  });
});
