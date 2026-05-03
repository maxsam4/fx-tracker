import type { CurrencyPair } from '../types.js';
import type { RateProvider, Quote } from './types.js';
import { httpJson } from '../scrape/httpClient.js';

// Careem Pay (UAE-based remittance). Uses the same public JSON endpoint
// the careem.com `/pay/sendmoney/` widget calls — no auth, no cookies,
// no Playwright required.
//
// Endpoint:
//   GET https://platform.careemapis.com/pubweb/api/remittance-widget-rates
//
// Response is an array, one entry per supported destination country:
//   {
//     destinationCountry: "IN",
//     destinationCurrency: "INR",
//     fee: 5,                       // AED fixed fee, only applies BELOW threshold
//     feeThresholdAmount: 400,      // AED — at or above this, transfer is free
//     minAmount: 10,                // AED
//     maxAmount: 150000,            // AED
//     rate: 25.8,                   // INR per AED
//     ...
//   }
//
// (The original `careempay.com` domain is geo-blocked outside UAE — the
// previous Playwright scrape always timed out from the Hetzner-DE host.
// `platform.careemapis.com` is reachable from anywhere.)

const CAREEM_API = 'https://platform.careemapis.com/pubweb/api/remittance-widget-rates';

interface CareemRateRow {
  destinationCountry: string;
  destinationCurrency: string;
  fee?: number;
  feeThresholdAmount?: number;
  minAmount?: number;
  maxAmount?: number;
  rate?: number;
}

export const careemPayProvider: RateProvider = {
  id: 'careemPay',
  displayName: 'Careem Pay',
  kind: 'api',

  supports(pair: CurrencyPair) {
    return pair.from === 'AED' && pair.to === 'INR';
  },

  async fetchQuote({ pair, sendAmount }): Promise<Quote> {
    const rows = await httpJson<CareemRateRow[]>(CAREEM_API, { timeoutMs: 12_000 });
    const row = Array.isArray(rows)
      ? rows.find((r) => r.destinationCurrency === pair.to)
      : undefined;
    if (!row || typeof row.rate !== 'number') {
      throw new Error(`Careem Pay: no rate row for ${pair.to}`);
    }
    const rate = row.rate;
    if (!(rate > 18 && rate < 35)) {
      throw new Error(`Careem Pay: rate out of range: ${rate}`);
    }

    // Fee is waived at or above feeThresholdAmount (typical "free above X"
    // remittance pricing — verified against the in-page calculator copy).
    const fixedFee = typeof row.fee === 'number' ? row.fee : 0;
    const threshold = typeof row.feeThresholdAmount === 'number' ? row.feeThresholdAmount : Infinity;
    const feeAmount = sendAmount >= threshold ? 0 : fixedFee;

    return {
      providerId: 'careemPay',
      dataSource: 'careempay_api',
      pair,
      sendAmount,
      receiveAmount: (sendAmount - feeAmount) * rate,
      rate,
      feeAmount,
      capturedAt: new Date(),
      raw: row,
    };
  },
};
