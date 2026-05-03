import { describe, it, expect, vi } from 'vitest';

// Replace the browserPool's withPage with a fake that supplies a synthetic
// `page` to the provider's callback. The provider only uses `goto`,
// `waitForSelector`, and `evaluate` — we mock those.
const FAKE_TABLE_DATA: string[][] = [
  // Fresh, transfer rate present → emitted (25.71)
  ['Al Ansari Exchange', '25.58', '', '25.71', 'May 2, 2026 08:45'],
  // Fresh but blank Transfer Rate → SKIPPED (we no longer fall back to Buy Rate)
  ['Goodwill Exchange', '25.85', '', '', 'May 1, 2026 18:00'],
  // Fresh; weird buy (33.33), sell (20), but transfer (25) is the canonical
  // rate. Transfer Rate is read directly.
  ['Al Fardan Exchange', '33.33', '20', '25', 'May 2, 2026 07:14'],
  // LuLu — three numbers; transfer (25.73) is read
  ['LuLu International Exchange', '25.73', '0.04', '25.73', 'May 2, 2026 09:45'],
  // Stale row (Sep 2025) → skipped even though Transfer Rate in range
  ['Al Razouki International Exchange', '24.17', '', '24.17', 'Sep 26, 2025 02:45'],
  // Transfer Rate out of range → skip
  ['Bogus Exchange', '0.04', '0.038', '0.04', 'May 2, 2026 03:00'],
  // No Transfer Rate at all → skip
  ['Empty Transfer', '25.85', '0.04', '', 'May 2, 2026 03:00'],
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
  it('emits one quote per house, ONLY when Transfer Rate is set + fresh', async () => {
    const quotes = await masarifProvider.fetchQuote({
      pair: { from: 'AED', to: 'INR' },
      sendAmount: 5000,
    });
    const arr = Array.isArray(quotes) ? quotes : [quotes];
    const byId = Object.fromEntries(arr.map((q) => [q.providerId, q]));

    // Houses with a fresh Transfer Rate are kept
    expect(byId.alAnsari?.rate).toBe(25.71);
    expect(byId.alFardan?.rate).toBe(25); // Transfer Rate, not the bogus 33.33
    expect(byId.lulu?.rate).toBe(25.73);
    expect(byId.sharaf?.rate).toBe(25.67);

    // Houses with a blank Transfer Rate are dropped (no buy-rate fallback)
    expect(byId).not.toHaveProperty('goodwill');
    expect(arr.find((q) => q.providerId.includes('empty'))).toBeUndefined();

    // Stale + out-of-range rows dropped
    expect(byId).not.toHaveProperty('alRazouki'); // stale Sep 2025
    expect(byId).not.toHaveProperty('bogus_');

    // capturedAt = poll time (the frozen "now" of this test), consistent
    // with every other provider. masarif's house-level publish time is
    // preserved in raw.masarifUpdatedAt for traceability.
    const FROZEN_NOW = new Date('2026-05-02T12:00:00Z');
    expect(byId.alAnsari?.capturedAt).toEqual(FROZEN_NOW);
    expect(byId.lulu?.capturedAt).toEqual(FROZEN_NOW);
    expect((byId.alAnsari?.raw as { masarifUpdatedAt?: string })?.masarifUpdatedAt)
      .toBe('2026-05-02T08:45:00.000Z');
    expect((byId.lulu?.raw as { masarifUpdatedAt?: string })?.masarifUpdatedAt)
      .toBe('2026-05-02T09:45:00.000Z');

    for (const q of arr) {
      expect(q.dataSource).toBe('masarif');
      expect(q.pair).toEqual({ from: 'AED', to: 'INR' });
      expect(q.sendAmount).toBe(5000);
      expect(q.feeAmount).toBe(0);
      expect(q.receiveAmount).toBe(5000 * q.rate);
    }
  });

  it('throws when no row has a fresh in-range Transfer Rate', async () => {
    const { withPage } = await import('../../src/scrape/browserPool.js');
    (withPage as ReturnType<typeof vi.fn>).mockImplementationOnce(async (fn: any) => {
      const page = {
        goto: vi.fn(),
        waitForSelector: vi.fn(),
        evaluate: vi.fn(async () => [
          // stale Transfer Rate
          ['Al Razouki', '24.17', '', '24.17', 'Sep 26, 2025 02:45'],
          // out-of-range Transfer Rate
          ['Bogus', '0.04', '0.038', '0.04', 'May 2, 2026 03:00'],
          // blank Transfer Rate (would have been buy-rate fallback before)
          ['Buy Only', '25.85', '', '', 'May 2, 2026 03:00'],
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
