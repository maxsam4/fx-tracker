import type { CurrencyPair } from '../types.js';
import type { RateProvider, Quote } from './types.js';
import { httpJson } from '../scrape/httpClient.js';
import { fetchWiseComparison, quoteFromWiseComparison } from './wiseComparisons.js';

// Remitly publishes a "promotional FX rate" on their currency-converter pages
// for first-time customers (capped at ~6000 USD / 4000 AED). For ongoing
// customers and amounts above the cap, a different "standard" rate applies —
// that's the rate users actually pay long-term, and it's the one we want.
//
// The promo rate is BETTER than mid-market (Remitly subsidises the first
// transfer) so showing it would rank Remitly artificially at the top of the
// comparison. We always read the standard rate.
//
// Resolution order:
//   1. Remitly's own calculator JSON API (`api.remitly.io/v3/calculator/estimate`).
//      Returns `exchange_rate.base_rate` directly — that IS the standard rate,
//      no Playwright needed. Verified live for both USD-INR (USA:USD-IND:INR)
//      and AED-INR (ARE:AED-IND:INR) corridors.
//   2. Wise comparisons API — also returns Remitly's standard quote. Used
//      only as a fallback if Remitly's API is blocked or returns an unexpected
//      shape; works for USD→INR but Wise returns empty providers for AED→INR.
//
// If both fail, throw — never fall back to the promotional rate.

interface CorridorConfig {
  // ISO-3 conduit codes for the Remitly calculator API.
  conduit: string;
  rangeLo: number;
  rangeHi: number;
}

const CORRIDORS: Record<string, CorridorConfig> = {
  'USD-INR': { conduit: 'USA:USD-IND:INR', rangeLo: 60, rangeHi: 130 },
  'AED-INR': { conduit: 'ARE:AED-IND:INR', rangeLo: 18, rangeHi: 35 },
};

interface RemitlyEstimateResponse {
  estimate?: {
    exchange_rate?: {
      base_rate?: string;
      promotional_exchange_rate?: string;
      capped_promotional_exchange_rate_amount?: string;
    };
    fee?: { total_fee_amount?: string };
    receive_amount?: string;
    send_amount?: string;
  };
}

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

    // 1. Remitly's calculator API — direct path, returns standard rate via
    //    `base_rate`. Sub-second; no Playwright dependency.
    try {
      const url = new URL('https://api.remitly.io/v3/calculator/estimate');
      url.searchParams.set('conduit', corridor.conduit);
      url.searchParams.set('anchor', 'SEND');
      url.searchParams.set('amount', String(sendAmount));
      url.searchParams.set('purpose', 'OTHER');
      url.searchParams.set('customer_segment', 'STANDARD');
      url.searchParams.set('customer_recognition', 'UNRECOGNIZED');
      url.searchParams.set('strict_promo', 'false');
      const data = await httpJson<RemitlyEstimateResponse>(url.toString(), {
        timeoutMs: 12_000,
      });
      const baseRate = data.estimate?.exchange_rate?.base_rate;
      const fee = data.estimate?.fee?.total_fee_amount ?? '0';
      if (!baseRate) throw new Error('Remitly API: missing exchange_rate.base_rate');
      const rate = parseFloat(baseRate);
      if (
        !Number.isFinite(rate) ||
        rate <= corridor.rangeLo ||
        rate >= corridor.rangeHi
      ) {
        throw new Error(`Remitly API: base_rate out of range: ${rate}`);
      }
      const feeAmount = parseFloat(fee);
      return {
        providerId: 'remitly',
        dataSource: 'remitly_api',
        pair,
        sendAmount,
        // The standard rate applies to (send - fee), but for amounts at or
        // above the promo cap the API's `receive_amount` already reflects the
        // blended (promo + standard) total. We report the raw standard rate
        // and let the dashboard derive receive = (send - fee) * rate so the
        // effective rate column is comparable across providers.
        receiveAmount: (sendAmount - feeAmount) * rate,
        rate,
        feeAmount,
        capturedAt: new Date(),
        raw: data,
      };
    } catch {
      // fall through to Wise comparisons
    }

    // 2. Wise comparisons fallback — only useful for USD-INR (Wise returns
    //    empty providers for AED-INR).
    const wise = await fetchWiseComparison(pair, sendAmount);
    return quoteFromWiseComparison(wise, pair, ['remitly', 'remitly inc'], 'remitly', sendAmount);
  },
};
