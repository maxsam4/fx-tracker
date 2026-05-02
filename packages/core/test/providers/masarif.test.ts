import { describe, it, expect, vi } from 'vitest';

// Replace the browserPool's withPage with a fake that supplies a synthetic
// `page` to the provider's callback. The provider only uses `goto`,
// `waitForSelector`, and `evaluate` — we mock those.
const FAKE_TABLE_DATA: string[][] = [
  // Fresh, transfer rate present → use transfer rate (25.71)
  ['Al Ansari Exchange', '25.58', '', '25.71', 'May 2, 2026 08:45'],
  // Fresh, only buy rate → use buy rate (25.85)
  ['Goodwill Exchange', '25.85', '', '', 'May 1, 2026 18:00'],
  // Fresh; weird buy (33.33), sell (20), but transfer (25) is the canonical
  // rate. Transfer Rate must win over Buy Rate.
  ['Al Fardan Exchange', '33.33', '20', '25', 'May 2, 2026 07:14'],
  // LuLu — three numbers; transfer wins (25.73)
  ['LuLu International Exchange', '25.73', '0.04', '25.73', 'May 2, 2026 09:45'],
  // Stale row (Sep 2025) → must be skipped even though buy rate is in range
  ['Al Razouki International Exchange', '24.17', '', '', 'Sep 26, 2025 02:45'],
  // Both numeric cells out of range → skip
  ['Bogus Exchange', '0.04', '0.038', '', 'May 2, 2026 03:00'],
  // Empty rate cells → skip
  ['Empty Row', '', '', '', 'May 2, 2026 03:00'],
  // Sharaf — transfer rate
  ['Sharaf Exchange', '26.88', '23.69', '25.67', 'May 2, 2026 04:30'],
];

vi.mock('../../src/scrape/browserPool.js', () => ({
  withPage: vi.fn(async (fn: (page: unknown) => Promise<unknown>) => {
    const page = {
      goto: vi.fn(async () => undefined),
      waitForSelector: vi.fn(async () => undefined),
      evaluate: vi.fn(async () => FAKE_TABLE_DATA),
    };
    return fn(page);
  }),
  shutdownBrowser: vi.fn(),
}));

// Stable "now" so the staleness filter is reproducible.
vi.useFakeTimers();
vi.setSystemTime(new Date('2026-05-02T12:00:00Z'));

import { masarifProvider } from '../../src/providers/masarif.js';

describe('masarifProvider.fetchQuote', () => {
  it('emits one quote per house, prefers Transfer Rate, drops stale rows', async () => {
    const quotes = await masarifProvider.fetchQuote({
      pair: { from: 'AED', to: 'INR' },
      sendAmount: 5000,
    });
    const arr = Array.isArray(quotes) ? quotes : [quotes];
    const byId = Object.fromEntries(arr.map((q) => [q.providerId, q]));

    // Fresh rows preserved
    expect(byId.alAnsari?.rate).toBe(25.71); // transfer rate wins
    expect(byId.goodwill?.rate).toBe(25.85); // buy rate fallback
    expect(byId.alFardan?.rate).toBe(25); // transfer rate, not the bogus 33.33
    expect(byId.lulu?.rate).toBe(25.73);
    expect(byId.sharaf?.rate).toBe(25.67);

    // Stale + bogus rows dropped
    expect(byId).not.toHaveProperty('alRazouki'); // stale Sep 2025
    expect(byId).not.toHaveProperty('bogus_'); // out-of-range only
    expect(arr.find((q) => q.providerId.includes('empty'))).toBeUndefined();

    // All rows have the right shape
    for (const q of arr) {
      expect(q.dataSource).toBe('masarif');
      expect(q.pair).toEqual({ from: 'AED', to: 'INR' });
      expect(q.sendAmount).toBe(5000);
      expect(q.feeAmount).toBe(0);
      expect(q.receiveAmount).toBe(5000 * q.rate);
    }
  });

  it('throws when the table yields zero usable rows', async () => {
    // Re-mock withPage to return only stale/out-of-range rows
    const { withPage } = await import('../../src/scrape/browserPool.js');
    (withPage as ReturnType<typeof vi.fn>).mockImplementationOnce(async (fn: any) => {
      const page = {
        goto: vi.fn(),
        waitForSelector: vi.fn(),
        evaluate: vi.fn(async () => [
          ['Al Razouki', '24.17', '', '', 'Sep 26, 2025 02:45'],
          ['Bogus', '0.04', '0.038', '', 'May 2, 2026 03:00'],
        ] as string[][]),
      };
      return fn(page);
    });

    await expect(
      masarifProvider.fetchQuote({ pair: { from: 'AED', to: 'INR' }, sendAmount: 5000 }),
    ).rejects.toThrow(/no rows|selectors/i);
  });

  it('declares supports correctly', () => {
    expect(masarifProvider.supports({ from: 'AED', to: 'INR' })).toBe(true);
    expect(masarifProvider.supports({ from: 'USD', to: 'INR' })).toBe(false);
  });
});
