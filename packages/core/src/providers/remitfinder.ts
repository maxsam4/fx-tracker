import type { CurrencyPair } from '../types.js';
import type { RateProvider, Quote } from './types.js';
import { withPage } from '../scrape/browserPool.js';

// Remitfinder is an aggregator-style site listing rates from many providers
// (Wise, Remitly, Xoom, Instarem, ...). One scrape returns multiple Quotes.
//
// SELECTORS BELOW ARE BEST-EFFORT — first live run is the test.

function pageUrl(pair: CurrencyPair): string {
  const from = pair.from.toLowerCase();
  const to = pair.to.toLowerCase();
  return `https://www.remitfinder.com/exchangeRates/${from}-to-${to}`;
}

interface RemitfinderRow {
  providerId: string;
  rate: number;
  fee: number | null;
}

const PROVIDER_NAME_TO_ID: Record<string, string> = {
  wise: 'wise',
  remitly: 'remitly',
  xoom: 'xoom',
  paypal: 'xoom',
  instarem: 'instarem',
  'western union': 'westernUnion',
  westernunion: 'westernUnion',
  'lulu money': 'lulu',
  lulu: 'lulu',
  worldremit: 'worldRemit',
  moneygram: 'moneyGram',
  'al ansari': 'alAnsari',
  sharaf: 'sharaf',
};

function normalizeName(name: string): string | null {
  const lower = name.trim().toLowerCase();
  for (const key of Object.keys(PROVIDER_NAME_TO_ID)) {
    if (lower.includes(key)) return PROVIDER_NAME_TO_ID[key]!;
  }
  return null;
}

export const remitfinderProvider: RateProvider = {
  id: 'remitfinder',
  displayName: 'Remitfinder (aggregator)',
  kind: 'aggregator',

  supports(pair: CurrencyPair) {
    return pair.to === 'INR' && (pair.from === 'USD' || pair.from === 'AED');
  },

  async fetchQuote({ pair, sendAmount }): Promise<Quote[]> {
    const rows = await withPage(async (page) => {
      await page.goto(pageUrl(pair), { waitUntil: 'domcontentloaded', timeout: 25_000 });
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
      const data = await page.evaluate(() => {
        const tableRows = Array.from(document.querySelectorAll('tr, .provider-row, li.row'));
        const out: { name: string; rate: number; fee: number | null }[] = [];
        for (const r of tableRows) {
          const text = (r.textContent ?? '').replace(/\s+/g, ' ').trim();
          // Require the rate to appear near a currency token to reduce false
          // positives (e.g., random "22.85 ago"). The row must contain INR.
          if (!/\bINR\b/i.test(text)) continue;
          const nameMatch = text.match(/^([A-Za-z][A-Za-z &\-]+?)\s/);
          const rateMatch = text.match(/(\d{1,3}\.\d{2,6})/);
          const feeMatch = text.match(/fee[^0-9]*(\d+(?:\.\d{1,2})?)/i);
          if (nameMatch && rateMatch) {
            out.push({
              name: nameMatch[1]!.trim(),
              rate: parseFloat(rateMatch[1]!),
              fee: feeMatch ? parseFloat(feeMatch[1]!) : null,
            });
          }
        }
        return out;
      });
      return data;
    });

    const now = new Date();
    const out: Quote[] = [];
    for (const r of rows) {
      const id = normalizeName(r.name);
      if (!id) continue;
      // Sanity check rate range based on pair (USD-INR ~80-90, AED-INR ~22-25)
      const inRange =
        pair.from === 'USD' ? r.rate > 60 && r.rate < 130 : r.rate > 18 && r.rate < 35;
      if (!inRange) continue;
      const fee = r.fee ?? 0;
      out.push({
        providerId: id,
        dataSource: 'remitfinder',
        pair,
        sendAmount,
        receiveAmount: (sendAmount - fee) * r.rate,
        rate: r.rate,
        feeAmount: fee,
        capturedAt: now,
        raw: { source: 'remitfinder', original: r },
      });
    }
    if (out.length === 0) {
      throw new Error('remitfinder scrape returned no usable rows');
    }
    return out;
  },
};
