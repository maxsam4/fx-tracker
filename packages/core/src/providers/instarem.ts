import type { CurrencyPair } from '../types.js';
import type { RateProvider, Quote } from './types.js';
import { fetchWiseComparison, quoteFromWiseComparison } from './wiseComparisons.js';
import { httpJson } from '../scrape/httpClient.js';

// Instarem's previous endpoint `transaction/computed-rate` now returns
// "Session Expired" without auth. The replacement is `computed-value` —
// what their website actually calls in the wild — which requires a
// `country_code` matching the source currency.
//
// AED→INR is not a supported Instarem corridor (the API rejects it with
// "Invalid combination of country-currency details"), so we limit the
// `supports()` check to USD-INR.
const COUNTRY_FOR_CURRENCY: Record<string, string> = {
  USD: 'US',
};

interface InstaremComputedValueResponse {
  success: boolean;
  data?: {
    transaction_config?: {
      fx_rate?: number;
      total_fee_amount?: number;
      from_currency_amount?: number;
    };
    destination_amount?: number;
    source_amount?: number;
  };
}

// Instarem direct first; fall back to Wise comparisons if blocked.
export const instaremProvider: RateProvider = {
  id: 'instarem',
  displayName: 'Instarem',
  kind: 'api',

  supports(pair: CurrencyPair) {
    return pair.to === 'INR' && pair.from in COUNTRY_FOR_CURRENCY;
  },

  async fetchQuote({ pair, sendAmount }): Promise<Quote> {
    try {
      const url = new URL('https://www.instarem.com/api/v1/public/transaction/computed-value');
      url.searchParams.set('source_currency', pair.from);
      url.searchParams.set('destination_currency', pair.to);
      url.searchParams.set('country_code', COUNTRY_FOR_CURRENCY[pair.from]!);
      url.searchParams.set('source_amount', String(sendAmount));
      const data = await httpJson<InstaremComputedValueResponse>(url.toString(), {
        timeoutMs: 12_000,
      });
      const cfg = data.data?.transaction_config;
      const destAmount = data.data?.destination_amount;
      if (!data.success || !cfg?.fx_rate) {
        throw new Error('Instarem response missing fields');
      }
      const fee = cfg.total_fee_amount ?? 0;
      const rate = cfg.fx_rate;
      // Some responses include destination_amount; if not, derive from the
      // post-fee send amount.
      const receive = typeof destAmount === 'number' ? destAmount : (sendAmount - fee) * rate;
      return {
        providerId: 'instarem',
        dataSource: 'instarem_api',
        pair,
        sendAmount,
        receiveAmount: receive,
        rate,
        feeAmount: fee,
        capturedAt: new Date(),
        raw: data,
      };
    } catch {
      const fallback = await fetchWiseComparison(pair, sendAmount);
      return quoteFromWiseComparison(fallback, pair, ['instarem'], 'instarem', sendAmount);
    }
  },
};
