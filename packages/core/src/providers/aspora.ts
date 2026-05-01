import type { CurrencyPair } from '../types.js';
import type { RateProvider, Quote } from './types.js';
import { httpJson } from '../scrape/httpClient.js';

// Aspora exposes a public quote API at api-z1.aspora.com discovered via
// network capture from aspora.com. Body shape:
//   POST /appserver/public-forex-provider/get-rates
//   { base_currency, quote_currency, amount }
// Returns Aspora's own quote PLUS competitor quotes (Wise, Remitly) for some
// corridors — we extract Aspora's row and emit it as a single Quote.
//
// The competitor data could also be emitted as additional Quotes (with
// dataSource='aspora_comparison'), giving us a second source for Wise and
// Remitly USD→INR. For now we keep this plugin focused on Aspora itself;
// cross-source aggregation is configurable via providers.yml in the future.

const ENDPOINT = 'https://api-z1.aspora.com/appserver/public-forex-provider/get-rates';

interface AsporaResponse {
  base_currency: string;
  quote_currency: string;
  send_amount: number;
  providers: Array<{
    name: string;
    quote: {
      rate: number;
      fee: number;
      received_amount: number;
      difference?: number;
    };
  }>;
}

export const asporaProvider: RateProvider = {
  id: 'aspora',
  displayName: 'Aspora',
  kind: 'api',

  supports(pair: CurrencyPair) {
    return pair.to === 'INR' && (pair.from === 'AED' || pair.from === 'USD');
  },

  async fetchQuote({ pair, sendAmount }): Promise<Quote> {
    const data = await httpJson<AsporaResponse>(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://aspora.com',
        Referer: 'https://aspora.com/',
      },
      body: JSON.stringify({
        base_currency: pair.from,
        quote_currency: pair.to,
        amount: sendAmount,
      }),
      timeoutMs: 12_000,
    });

    const aspora = data.providers.find((p) => p.name.toLowerCase() === 'aspora');
    if (!aspora) {
      throw new Error('Aspora row not found in response');
    }
    const q = aspora.quote;

    return {
      providerId: 'aspora',
      dataSource: 'aspora_api',
      pair,
      sendAmount: data.send_amount ?? sendAmount,
      receiveAmount: q.received_amount,
      rate: q.rate,
      feeAmount: q.fee,
      capturedAt: new Date(),
      raw: data,
    };
  },
};
