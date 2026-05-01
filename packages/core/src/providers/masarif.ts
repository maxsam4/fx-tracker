import type { CurrencyPair } from '../types.js';
import type { RateProvider, Quote } from './types.js';
import { withPage } from '../scrape/browserPool.js';

// masarif.ae is a UAE rate aggregator that lists daily rates from many
// exchange houses (LuLu, Al Ansari, Sharaf, UAE Exchange, etc.).
//
// One scrape returns many providers — we emit one Quote per row.
//
// SELECTORS BELOW ARE BEST-EFFORT and almost certainly need adjustment after
// the first live run. The structure is: a table with rows like
//   <house name> | buy rate | sell rate
// We use the BUY rate (what they pay for AED in INR) for AED→INR.
// If the layout has changed, the parser will throw and the run row will be
// recorded as 'error' — fix selectors and redeploy.
//
// masarif provides no fee data (rates only); we record fee=0 and trust that
// the underlying houses bake their margin into the rate.

// Live probe (2026-04): /en/rates/india returns 404; the homepage at
// masarif.ae shows aggregated UAE exchange-house rates. The page is JS-rendered
// (no INR mentions in the static HTML), so Playwright is required. Selector
// hints below are best-effort.
const MASARIF_URL_INR = 'https://www.masarif.ae/';

interface AggregatorRow {
  providerId: string;
  rate: number;
  rawName?: string;
}

const PROVIDER_ID_MAP: Record<string, string> = {
  lulu: 'lulu',
  'lulu exchange': 'lulu',
  'al ansari': 'alAnsari',
  'al ansari exchange': 'alAnsari',
  sharaf: 'sharaf',
  'sharaf exchange': 'sharaf',
  'uae exchange': 'uaeExchange',
  'wall street': 'wallStreet',
  'wall street exchange': 'wallStreet',
  'al fardan': 'alFardan',
};

function normalizeProviderId(name: string): string {
  const lower = name.trim().toLowerCase();
  for (const key of Object.keys(PROVIDER_ID_MAP)) {
    if (lower.includes(key)) return PROVIDER_ID_MAP[key]!;
  }
  // Fallback: snake-cased name
  return lower.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
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
      await page.goto(MASARIF_URL_INR, { waitUntil: 'domcontentloaded', timeout: 25_000 });
      // Wait for rate table; selector likely to change.
      await page
        .waitForSelector('table, .rates-table, [data-rates]', { timeout: 15_000 })
        .catch(() => {});
      // Generic extraction: find every row with a number that looks like INR-per-AED
      const data = await page.evaluate(() => {
        const out: { name: string; rate: number }[] = [];
        const rows = Array.from(document.querySelectorAll('tr, .row, li'));
        for (const r of rows) {
          const text = (r.textContent ?? '').replace(/\s+/g, ' ').trim();
          // INR-per-AED is typically 22..25
          const m = text.match(/([A-Za-z][A-Za-z &\-]+?)\s*([\d]{1,3}\.[\d]{2,6})\b/);
          if (m && m[1] && m[2]) {
            const rate = parseFloat(m[2]);
            if (rate > 18 && rate < 35) {
              out.push({ name: m[1].trim(), rate });
            }
          }
        }
        return out;
      });
      const mapped: AggregatorRow[] = data.map((r) => ({
        providerId: normalizeProviderId(r.name),
        rate: r.rate,
        rawName: r.name,
      }));
      return mapped;
    });

    if (rows.length === 0) {
      throw new Error('masarif scrape returned no rows; selectors may need updating');
    }

    const now = new Date();
    return rows.map((row) => ({
      providerId: row.providerId,
      dataSource: 'masarif',
      pair,
      sendAmount,
      receiveAmount: sendAmount * row.rate,
      rate: row.rate,
      feeAmount: 0,
      capturedAt: now,
      raw: { source: 'masarif', original: row },
    }));
  },
};
