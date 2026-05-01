import type { CurrencyPair } from '../types.js';
import type { RateProvider, Quote } from './types.js';
import { withPage } from '../scrape/browserPool.js';

// Live probe (2026-04): Western Union is NOT in Wise's comparison endpoint
// for either USD-INR or AED-INR, and they have no public rate API. We scrape
// the public exchange-rate calculator page.
//
// SELECTORS BELOW ARE BEST-EFFORT — first live runs may need adjustment.
// On failure the run is recorded as 'error' and other providers are unaffected.

function pageUrl(pair: CurrencyPair): string {
  if (pair.from === 'USD' && pair.to === 'INR') {
    return 'https://www.westernunion.com/us/en/web/send-money/start';
  }
  if (pair.from === 'AED' && pair.to === 'INR') {
    return 'https://www.westernunion.com/ae/en/web/send-money/start';
  }
  throw new Error(`Western Union URL not configured for ${pair.from}-${pair.to}`);
}

// Hardcoded regex pairs per supported corridor — avoids dynamic RegExp.
const PATTERNS: Record<string, { direct: RegExp; loose: RegExp; lo: number; hi: number }> = {
  'USD-INR': {
    direct: /1\s*USD\s*=\s*(\d{1,3}\.\d{2,6})\s*INR/i,
    loose: /(\d{1,3}\.\d{2,6})\s*INR/g,
    lo: 60,
    hi: 130,
  },
  'AED-INR': {
    direct: /1\s*AED\s*=\s*(\d{1,3}\.\d{2,6})\s*INR/i,
    loose: /(\d{1,3}\.\d{2,6})\s*INR/g,
    lo: 18,
    hi: 35,
  },
};

export const westernUnionProvider: RateProvider = {
  id: 'westernUnion',
  displayName: 'Western Union',
  kind: 'scrape',

  supports(pair: CurrencyPair) {
    return Boolean(PATTERNS[`${pair.from}-${pair.to}`]);
  },

  async fetchQuote({ pair, sendAmount }): Promise<Quote> {
    const key = `${pair.from}-${pair.to}`;
    const patterns = PATTERNS[key];
    if (!patterns) throw new Error(`Western Union: unsupported pair ${key}`);

    const result = await withPage(async (page) => {
      await page.goto(pageUrl(pair), { waitUntil: 'domcontentloaded', timeout: 25_000 });
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
      const text = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));

      const direct = text.match(patterns.direct);
      if (direct?.[1]) {
        return { rate: parseFloat(direct[1]), fee: 0 };
      }
      for (const m of text.matchAll(patterns.loose)) {
        const r = parseFloat(m[1]!);
        if (r > patterns.lo && r < patterns.hi) return { rate: r, fee: 0 };
      }
      throw new Error('Western Union rate not found in rendered page');
    });

    return {
      providerId: 'westernUnion',
      dataSource: 'westernunion_scrape',
      pair,
      sendAmount,
      receiveAmount: (sendAmount - result.fee) * result.rate,
      rate: result.rate,
      feeAmount: result.fee,
      capturedAt: new Date(),
      raw: { source: 'westernunion_scrape' },
    };
  },
};
