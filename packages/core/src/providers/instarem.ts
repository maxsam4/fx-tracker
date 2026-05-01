import type { CurrencyPair } from '../types.js';
import type { RateProvider, Quote } from './types.js';
import { fetchWiseComparison, quoteFromWiseComparison } from './wiseComparisons.js';
import { httpJson } from '../scrape/httpClient.js';

interface InstaremFxResponse {
  destination_amount: number;
  source_amount: number;
  fx_rate: number;
  transfer_fee: number;
}

// Instarem has a public-ish FX endpoint:
//   https://www.instarem.com/api/v1/public/transaction/computed-rate?source_currency=USD&destination_currency=INR&source_amount=1000
// We try Instarem direct first; fall back to Wise comparisons if blocked.
export const instaremProvider: RateProvider = {
  id: 'instarem',
  displayName: 'Instarem',
  kind: 'api',

  supports(pair: CurrencyPair) {
    return pair.to === 'INR' && (pair.from === 'USD' || pair.from === 'AED');
  },

  async fetchQuote({ pair, sendAmount }): Promise<Quote> {
    try {
      const url = new URL('https://www.instarem.com/api/v1/public/transaction/computed-rate');
      url.searchParams.set('source_currency', pair.from);
      url.searchParams.set('destination_currency', pair.to);
      url.searchParams.set('source_amount', String(sendAmount));
      const data = await httpJson<InstaremFxResponse>(url.toString(), { timeoutMs: 12_000 });
      if (!data.fx_rate || !data.destination_amount) {
        throw new Error('Instarem response missing fields');
      }
      return {
        providerId: 'instarem',
        dataSource: 'instarem_api',
        pair,
        sendAmount: data.source_amount ?? sendAmount,
        receiveAmount: data.destination_amount,
        rate: data.fx_rate,
        feeAmount: data.transfer_fee ?? 0,
        capturedAt: new Date(),
        raw: data,
      };
    } catch {
      const fallback = await fetchWiseComparison(pair, sendAmount);
      return quoteFromWiseComparison(fallback, pair, ['instarem'], 'instarem', sendAmount);
    }
  },
};
