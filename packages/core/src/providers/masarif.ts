import type { CurrencyPair } from '../types.js';
import type { RateProvider, Quote } from './types.js';
import { withPage } from '../scrape/browserPool.js';

// masarif.ae aggregates daily AED rates from UAE exchange houses (LuLu,
// Al Ansari, Sharaf, Al Fardan, etc.). One scrape returns many providers
// — we emit one Quote per row.
//
// Page structure (verified live 2026-05-02):
//   URL:   https://masarif.ae/currency-exchange-rates/inr
//   Table: <table class="...sortable"> with five columns —
//     [ Exchange | Buy Rate | Sell Rate | Transfer Rate | Updated At ]
//
// Column meaning (from the house's perspective):
//   - Buy Rate (INR/AED): house pays this many INR for 1 AED that the customer
//                         is selling. Higher = better for the customer.
//   - Sell Rate: often expressed as AED/INR (~0.04). Inverse of buy.
//   - Transfer Rate (INR/AED): the rate the house offers for AED→INR remittance
//                              specifically. This is what the recipient
//                              actually receives per AED sent.
//
// Rate selection: ONLY Transfer Rate. Buy Rate often reflects branch-counter
// rates (cash-in-hand AED→INR) that don't apply to remittance, so houses with
// blank Transfer Rate are intentionally dropped — better to skip a row than
// to mislead users with a non-comparable rate.
//
// Freshness: many houses leave stale rows on the page (Sep 2025, Feb 2026).
// We drop anything updated more than STALE_DAYS ago. The Quote's
// `capturedAt` is the time we polled (consistent with every other provider's
// semantic — "when did fx-tracker last refresh this row"). The masarif-
// reported "Updated At" — when the house itself last republished — is
// preserved in `raw.masarifUpdatedAt` for traceability and future UI use.

const URL_INR = 'https://masarif.ae/currency-exchange-rates/inr';
const STALE_DAYS = 7;
const RATE_LO = 18;
const RATE_HI = 35;

interface AggregatorRow {
  providerId: string;
  rate: number;
  rawName: string;
  updatedAt: Date;
}

// Lower-cased exchange-name fragment → canonical provider id used in
// `config/providers.yml` `preferredSource`. Order matters — longer fragments
// first so "al ansari" doesn't shadow "al ansari exchange".
const PROVIDER_ID_MAP: Array<[fragment: string, providerId: string]> = [
  ['lulu international', 'lulu'],
  ['lulu exchange', 'lulu'],
  ['lulu money', 'lulu'],
  ['lulu', 'lulu'],
  ['al ansari', 'alAnsari'],
  ['sharaf exchange', 'sharaf'],
  ['sharaf', 'sharaf'],
  ['uae exchange', 'uaeExchange'],
  ['wall street exchange', 'wallStreet'],
  ['wall street', 'wallStreet'],
  ['al fardan', 'alFardan'],
  ['al fuad', 'alFuad'],
  ['al ghurair', 'alGhurair'],
  ['al ahalia', 'alAhalia'],
  ['al dahab', 'alDahab'],
  ['joyalukkas', 'joyalukkas'],
  ['lari exchange', 'lari'],
  ['orient exchange', 'orient'],
  ['multinet', 'multinet'],
  ['gcc exchange', 'gcc'],
  ['hadi express', 'hadiExpress'],
  ['goodwill', 'goodwill'],
  ['index exchange', 'indexExchange'],
  ['leela megh', 'leelaMegh'],
  ['lm exchange', 'leelaMegh'],
  ['travelex', 'travelex'],
  ['universal exchange', 'universalExchange'],
];

function normalizeProviderId(name: string): string {
  const lower = name.trim().toLowerCase();
  for (const [fragment, providerId] of PROVIDER_ID_MAP) {
    if (lower.includes(fragment)) return providerId;
  }
  // Fallback: snake-case the original name. This still produces a stable id;
  // it just won't be subject to cross-provider dedup against an explicit
  // direct-scrape plugin (we don't have one for these long-tail houses).
  return lower
    .replace(/exchange/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function parseRate(cell: string): number | null {
  const m = cell.replace(/,/g, '').match(/^(\d{1,3}(?:\.\d{1,6})?)$/);
  if (!m) return null;
  const v = parseFloat(m[1]!);
  return Number.isFinite(v) ? v : null;
}

function inRange(v: number | null): v is number {
  return v !== null && v > RATE_LO && v < RATE_HI;
}

// "May 2, 2026 08:30" → Date. Returns null if unparseable. We avoid `new
// Date(string)` for free-form strings (locale-dependent); instead match the
// month/day/year/time fields explicitly.
const MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};
function parseUpdatedAt(cell: string): Date | null {
  const m = cell.match(/(\w{3})\s+(\d{1,2}),\s+(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  const month = MONTHS[m[1]!];
  if (month === undefined) return null;
  const day = parseInt(m[2]!, 10);
  const year = parseInt(m[3]!, 10);
  const hour = m[4] ? parseInt(m[4]!, 10) : 0;
  const minute = m[5] ? parseInt(m[5]!, 10) : 0;
  // masarif timestamps appear to be UAE local time (UTC+4). Treat them as
  // UTC for staleness filtering — the 4-hour drift is irrelevant at the
  // 7-day threshold we use.
  return new Date(Date.UTC(year, month, day, hour, minute));
}

export const masarifProvider: RateProvider = {
  id: 'masarif',
  displayName: 'masarif.ae (aggregator)',
  kind: 'aggregator',

  supports(pair: CurrencyPair) {
    return pair.from === 'AED' && pair.to === 'INR';
  },

  async fetchQuote({ pair, sendAmount }): Promise<Quote[]> {
    const rows = await withPage(async (page) => {
      await page.goto(URL_INR, { waitUntil: 'domcontentloaded', timeout: 25_000 });
      // The table is rendered server-side, but we still wait for it explicitly
      // to fail loudly if the layout has changed.
      await page.waitForSelector('table.sortable, table', { timeout: 15_000 });

      // Pull cells per row. We grab everything and filter in Node — keeps the
      // browser-context code minimal (browser context can't access tsx
      // helpers).
      const data = await page.evaluate(() => {
        const trs = Array.from(document.querySelectorAll('table tbody tr'));
        return trs.map((tr) =>
          Array.from(tr.children).map((td) => (td.textContent ?? '').replace(/\s+/g, ' ').trim()),
        );
      });

      const cutoff = Date.now() - STALE_DAYS * 24 * 3600 * 1000;
      const out: AggregatorRow[] = [];
      for (const cells of data) {
        if (cells.length < 5) continue;
        const [name, , , transferCell, updatedCell] = cells as [
          string,
          string,
          string,
          string,
          string,
        ];
        if (!name) continue;

        const updatedAt = parseUpdatedAt(updatedCell ?? '');
        if (!updatedAt || updatedAt.getTime() < cutoff) continue;

        // Transfer Rate only — Buy Rate is the cash-counter rate, not a
        // remittance rate, so it's not directly comparable to the rates we
        // pull from Wise/Aspora/Remitly. A house with a blank Transfer Rate
        // simply isn't quoting AED→INR remittance and should be skipped.
        const transferRate = parseRate(transferCell);
        if (!inRange(transferRate)) continue;

        out.push({
          providerId: normalizeProviderId(name),
          rate: transferRate,
          rawName: name,
          updatedAt,
        });
      }
      return out;
    });

    if (rows.length === 0) {
      throw new Error('masarif scrape returned no rows; selectors may need updating');
    }

    const polledAt = new Date();
    return rows.map((row) => ({
      providerId: row.providerId,
      dataSource: 'masarif',
      pair,
      sendAmount,
      receiveAmount: sendAmount * row.rate,
      rate: row.rate,
      feeAmount: 0,
      capturedAt: polledAt,
      raw: {
        source: 'masarif',
        rawName: row.rawName,
        // The house's own publish time — preserved for inspection/debugging
        // and in case the UI later wants to surface "house last refreshed at".
        masarifUpdatedAt: row.updatedAt.toISOString(),
      },
    }));
  },
};
