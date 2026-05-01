import { httpJson } from '../scrape/httpClient.js';
import type { CurrencyPair } from '../types.js';
import type { Quote, RateProvider } from './types.js';

// Wise's quote API does not require auth for unauthenticated rate previews:
//   https://api.wise.com/v3/comparisons/?sourceCurrency=USD&targetCurrency=INR&sendAmount=1000
// Returns a list of providers including Wise itself; we filter to providers[0]==Wise.
//
// If the unauthenticated endpoint disappears or rate-limits us, we can switch to
// the v1 mid-market + a quote API call (requires a free API token).

interface WiseComparisonResponse {
  sourceCurrency: string;
  targetCurrency: string;
  sourceAmount: number;
  providers: Array<{
    name: string;
    alias: string;
    quotes: Array<{
      rate: number;
      fee: number;
      sourceAmount: number;
      targetAmount: number;
      receivedAmount?: number;
    }>;
  }>;
}

export const wiseProvider: RateProvider = {
  id: 'wise',
  displayName: 'Wise',
  kind: 'api',

  supports(pair: CurrencyPair) {
    return pair.to === 'INR' && (pair.from === 'USD' || pair.from === 'AED');
  },

  async fetchQuote({ pair, sendAmount }) {
    const url = new URL('https://api.wise.com/v3/comparisons/');
    url.searchParams.set('sourceCurrency', pair.from);
    url.searchParams.set('targetCurrency', pair.to);
    url.searchParams.set('sendAmount', String(sendAmount));

    const data = await httpJson<WiseComparisonResponse>(url.toString(), { timeoutMs: 15_000 });
    const wise = data.providers.find(
      (p) => p.alias?.toLowerCase() === 'wise' || p.name?.toLowerCase() === 'wise',
    );
    if (!wise || wise.quotes.length === 0) {
      throw new Error('Wise not found in comparison response');
    }
    const q = wise.quotes[0]!;
    const receive = q.receivedAmount ?? q.targetAmount;
    // Wise's response sometimes omits per-quote sourceAmount; fall back to the
    // input we asked for, then to the response-level sourceAmount.
    const send = q.sourceAmount ?? data.sourceAmount ?? sendAmount;

    const quote: Quote = {
      providerId: 'wise',
      dataSource: 'wise_api',
      pair,
      sendAmount: send,
      receiveAmount: receive,
      rate: q.rate,
      feeAmount: q.fee ?? 0,
      capturedAt: new Date(),
      raw: { wiseEntry: wise },
    };
    return quote;
  },
};
