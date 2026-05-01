import type { CurrencyPair } from '../types.js';
import type { RateProvider, Quote } from './types.js';
import { httpText } from '../scrape/httpClient.js';
import { withPage } from '../scrape/browserPool.js';
import { fetchWiseComparison, quoteFromWiseComparison } from './wiseComparisons.js';
import { logger } from '../logger.js';

// Remitly publishes a "promotional FX rate" on their currency-converter pages
// for first-time customers (capped at ~6000 USD / 4000 AED). For ongoing
// customers and amounts above the cap, a different "standard" rate applies —
// that's the rate users actually pay long-term, and it's the one we want.
//
// Resolution order (best → worst):
//   1. Wise comparisons API — returns Remitly's STANDARD quote directly. Fast,
//      no browser. Works for USD→INR. Returns empty for AED→INR.
//   2. Playwright on Remitly's converter page, calculator filled with amount
//      above the promo cap. The page then renders BOTH "Special rate" (promo)
//      and "Standard rate 1 X = N INR applies to the rest of the transfer".
//      We extract the standard rate. Slower (~5s) but works for both pairs.
//   3. Plain HTTP scrape — only the promo rate is in the SSR HTML. Used as a
//      last resort with a documented caveat.

interface CorridorConfig {
  url: string;
  // Amount to type into the calculator that crosses the promo cap. The
  // resulting rendered DOM will show both rates side by side.
  amountAboveCap: string;
  // Hardcoded literal regexes per corridor (avoids dynamic RegExp / ReDoS).
  promoRate: RegExp;
  standardRate: RegExp;
  rangeLo: number;
  rangeHi: number;
}

const CORRIDORS: Record<string, CorridorConfig> = {
  'USD-INR': {
    url: 'https://www.remitly.com/us/en/currency-converter/usd-to-inr-rate',
    amountAboveCap: '10000',
    promoRate: /1\s*USD\s*=\s*(\d{1,3}\.\d{2,6})\s*INR/i,
    standardRate: /Standard\s+rate\s+1\s*USD\s*=\s*(\d{1,3}\.\d{2,6})\s*INR/i,
    rangeLo: 60,
    rangeHi: 130,
  },
  'AED-INR': {
    url: 'https://www.remitly.com/ae/en/currency-converter/aed-to-inr-rate',
    amountAboveCap: '50000',
    promoRate: /1\s*AED\s*=\s*(\d{1,3}\.\d{2,6})\s*INR/i,
    standardRate: /Standard\s+rate\s+1\s*AED\s*=\s*(\d{1,3}\.\d{2,6})\s*INR/i,
    rangeLo: 18,
    rangeHi: 35,
  },
};

export const remitlyProvider: RateProvider = {
  id: 'remitly',
  displayName: 'Remitly',
  kind: 'aggregator',

  supports(pair: CurrencyPair) {
    return Boolean(CORRIDORS[`${pair.from}-${pair.to}`]);
  },

  async fetchQuote({ pair, sendAmount }): Promise<Quote> {
    const key = `${pair.from}-${pair.to}`;
    const corridor = CORRIDORS[key];
    if (!corridor) throw new Error(`Remitly: unsupported pair ${key}`);

    // 1. Wise comparisons — fastest, returns Remitly's standard quote.
    try {
      const data = await fetchWiseComparison(pair, sendAmount);
      return quoteFromWiseComparison(data, pair, ['remitly', 'remitly inc'], 'remitly', sendAmount);
    } catch {
      // empty providers (AED-INR) or transient error → fall through
    }

    // 2. Playwright + calculator interaction → standard rate from rendered DOM.
    try {
      const standardRate = await fetchStandardRateViaCalculator(corridor);
      if (Number.isFinite(standardRate) && standardRate > corridor.rangeLo && standardRate < corridor.rangeHi) {
        return {
          providerId: 'remitly',
          dataSource: 'remitly_standard',
          pair,
          sendAmount,
          receiveAmount: sendAmount * standardRate,
          rate: standardRate,
          feeAmount: 0,
          capturedAt: new Date(),
          raw: { source: 'remitly_calculator_standard', url: corridor.url },
        };
      }
    } catch (err) {
      logger.warn({ err: String(err) }, 'remitly calculator scrape failed');
    }

    // 3. Plain HTTP — promo rate only (caveat: this is the first-transfer
    //    promotional rate, not what existing customers pay).
    const html = await httpText(corridor.url, { timeoutMs: 15_000 });
    const m = html.match(corridor.promoRate);
    if (!m?.[1]) {
      throw new Error('Remitly: no rate available from any source');
    }
    const rate = parseFloat(m[1]);
    return {
      providerId: 'remitly',
      dataSource: 'remitly_promo',
      pair,
      sendAmount,
      receiveAmount: sendAmount * rate,
      rate,
      feeAmount: 0,
      capturedAt: new Date(),
      raw: { source: 'remitly_ssr_promo', url: corridor.url, note: 'promotional rate; first-transfer only' },
    };
  },
};

async function fetchStandardRateViaCalculator(corridor: CorridorConfig): Promise<number> {
  return withPage(async (page) => {
    await page.goto(corridor.url, { waitUntil: 'domcontentloaded', timeout: 25_000 });
    // Give the React app time to hydrate before interacting.
    await page.waitForTimeout(4000);
    await page.waitForSelector('input[id*="you-send"]', { timeout: 12_000 });

    // Use `fill()` rather than click+type. Remitly's footer/cookie banner
    // overlaps the input, so a normal click stalls and a force-click clicks
    // through but doesn't focus the input — keyboard.type() then went to the
    // body. fill() directly sets .value and dispatches an input event, which
    // React's onChange listens for. force: true bypasses the actionability
    // check (the overlapping banner). No focus required.
    const sendInput = await page.$('input[id*="you-send"]');
    if (!sendInput) throw new Error('Remitly send-amount input not found');
    await sendInput.fill(corridor.amountAboveCap, { force: true });

    // Poll: wait → read → check. Repeat up to 3x. React's re-render after the
    // input change can be flaky to time precisely.
    let textBlob = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      await page
        .waitForFunction(
          () => /Standard\s+rate\s+1\s*[A-Z]{3}\s*=\s*\d/.test(document.body.innerText),
          undefined,
          { timeout: 5_000 },
        )
        .catch(() => {});
      textBlob = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
      if (corridor.standardRate.test(textBlob)) break;
      await page.waitForTimeout(2000);
    }

    const match = textBlob.match(corridor.standardRate);
    if (!match?.[1]) {
      throw new Error('Remitly standard rate text not found in rendered DOM');
    }
    return parseFloat(match[1]);
  });
}
