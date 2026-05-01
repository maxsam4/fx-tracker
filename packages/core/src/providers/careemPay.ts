import type { CurrencyPair } from '../types.js';
import type { RateProvider, Quote } from './types.js';
import { withPage } from '../scrape/browserPool.js';

// Careem Pay (UAE-based remittance). No public API; rates surfaced through
// the in-app/quote flow on careempay.com. We scrape the public landing
// "Send money to India" page for an indicative rate.
//
// SELECTORS BELOW ARE BEST-EFFORT — first live run will tell us if they
// hold. The plugin records an error run and never blocks others on failure.
// careem doesn't publish fees publicly; recorded as 0 (rate-only).

const CAREEM_URL = 'https://www.careempay.com/en-ae/send-money-to-india';

export const careemPayProvider: RateProvider = {
  id: 'careemPay',
  displayName: 'Careem Pay',
  kind: 'scrape',

  supports(pair: CurrencyPair) {
    return pair.from === 'AED' && pair.to === 'INR';
  },

  async fetchQuote({ pair, sendAmount }): Promise<Quote> {
    const rate = await withPage(async (page) => {
      await page.goto(CAREEM_URL, { waitUntil: 'domcontentloaded', timeout: 25_000 });
      await page
        .waitForSelector('main, body', { timeout: 10_000 })
        .catch(() => {});
      const text = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
      // INR-per-AED format like "1 AED = 22.85 INR"
      const m =
        text.match(/1\s*AED\s*=\s*(\d{1,3}\.\d{2,6})\s*INR/i) ??
        text.match(/(\d{1,3}\.\d{2,6})\s*INR\b/);
      if (!m) throw new Error('Careem Pay rate not found on landing page');
      const r = parseFloat(m[1]!);
      if (!(r > 18 && r < 35)) throw new Error(`Careem Pay rate out of range: ${r}`);
      return r;
    });

    return {
      providerId: 'careemPay',
      dataSource: 'careempay_scrape',
      pair,
      sendAmount,
      receiveAmount: sendAmount * rate,
      rate,
      feeAmount: 0,
      capturedAt: new Date(),
      raw: { source: 'careempay_landing' },
    };
  },
};
