import type { CurrencyPair } from '../types.js';
import type { RateProvider, Quote } from './types.js';
import { fetchWiseComparison, quoteFromWiseComparison } from './wiseComparisons.js';

export const xoomProvider: RateProvider = {
  id: 'xoom',
  displayName: 'Xoom (PayPal)',
  kind: 'aggregator',

  supports(pair: CurrencyPair) {
    return pair.to === 'INR' && pair.from === 'USD';
  },

  async fetchQuote({ pair, sendAmount }): Promise<Quote> {
    const data = await fetchWiseComparison(pair, sendAmount);
    return quoteFromWiseComparison(data, pair, ['xoom', 'xoom by paypal', 'paypal'], 'xoom', sendAmount);
  },
};
