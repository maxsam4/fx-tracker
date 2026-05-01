import type { CurrencyPair } from '../types.js';
import type { RateProvider, Quote } from './types.js';
import { withPage } from '../scrape/browserPool.js';

// LuLu Money (direct). Complements masarif's aggregator coverage so we have
// a redundant source. Per providers.yml `preferredSource` defaults, masarif
// wins on conflict.
//
// SELECTORS BELOW ARE BEST-EFFORT.

// Live probe (2026-04): lulumoneyremit.com is not reachable; the actual brand
// is LuLu Money at lulumoney.com. Their site is a SPA loading rates via JS,
// so this scrape must use Playwright. Direct path to the AED→INR view via the
// country selector.
const LULU_URL = 'https://www.lulumoney.com/index.php?country=UAE#/';

export const luluProvider: RateProvider = {
  id: 'lulu',
  displayName: 'LuLu Money',
  kind: 'scrape',

  supports(pair: CurrencyPair) {
    return pair.from === 'AED' && pair.to === 'INR';
  },

  async fetchQuote({ pair, sendAmount }): Promise<Quote> {
    const rate = await withPage(async (page) => {
      await page.goto(LULU_URL, { waitUntil: 'domcontentloaded', timeout: 25_000 });
      await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
      const text = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
      const m =
        text.match(/1\s*AED\s*=\s*(\d{1,3}\.\d{2,6})\s*INR/i) ??
        text.match(/(\d{1,3}\.\d{2,6})\s*INR/);
      if (!m) throw new Error('LuLu rate not found');
      const r = parseFloat(m[1]!);
      if (!(r > 18 && r < 35)) throw new Error(`LuLu rate out of range: ${r}`);
      return r;
    });

    return {
      providerId: 'lulu',
      dataSource: 'lulu_direct',
      pair,
      sendAmount,
      receiveAmount: sendAmount * rate,
      rate,
      feeAmount: 0,
      capturedAt: new Date(),
      raw: { source: 'lulu_direct' },
    };
  },
};
