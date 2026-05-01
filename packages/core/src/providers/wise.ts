import { httpJson } from '../scrape/httpClient.js';
import type { CurrencyPair } from '../types.js';
import type { Quote, RateProvider } from './types.js';

// Wise exposes two unauthenticated endpoints we use here:
//
//   1. POST https://api.wise.com/v3/quotes/
//      Body: { sourceCurrency, targetCurrency, sourceAmount }
//      Returns Wise's own rate + per-payment-option fees.
//      WORKS FOR BOTH USD→INR and AED→INR.
//
//   2. GET  https://api.wise.com/v3/comparisons/?sourceCurrency=…&targetCurrency=…&sendAmount=…
//      Returns competitor providers (Remitly, Xoom, MoneyGram, Instarem, …).
//      Empty providers[] for AED→INR. Used as a backup for Wise itself when
//      /v3/quotes/ is unavailable, AND as the source for aggregator plugins
//      (xoom, remitly fallback, instarem fallback) — see wiseComparisons.ts.
//
// Why /v3/quotes/ is primary now: /v3/comparisons/ silently returns an empty
// providers array for AED→INR, which made the Wise plugin fail for that
// corridor. /v3/quotes/ has full coverage. Direction of fee selection inside
// the response: pick the cheapest non-disabled paymentOption; if all options
// are flagged disabled (geo-blocked from this IP), still use the lowest fee
// option since the rate is identical.

interface WiseQuoteResponse {
  sourceCurrency: string;
  targetCurrency: string;
  sourceAmount: number;
  rate: number;
  paymentOptions: Array<{
    sourceAmount?: number;
    targetAmount?: number;
    payIn: string;
    payOut: string;
    disabled?: boolean;
    fee: { total: number; transferwise: number; payIn: number; discount: number };
  }>;
}

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
    try {
      return await fetchViaQuotes(pair, sendAmount);
    } catch (err) {
      // Try the comparisons endpoint as a backup — it may still carry Wise
      // for some corridors even if /v3/quotes/ hiccups.
      try {
        return await fetchViaComparisons(pair, sendAmount);
      } catch {
        throw err instanceof Error ? err : new Error(String(err));
      }
    }
  },
};

async function fetchViaQuotes(pair: CurrencyPair, sendAmount: number): Promise<Quote> {
  const data = await httpJson<WiseQuoteResponse>('https://api.wise.com/v3/quotes/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sourceCurrency: pair.from,
      targetCurrency: pair.to,
      sourceAmount: sendAmount,
    }),
    timeoutMs: 15_000,
  });
  if (typeof data.rate !== 'number' || !Array.isArray(data.paymentOptions)) {
    throw new Error('Wise /v3/quotes/ returned unexpected shape');
  }
  const option = pickPaymentOption(data.paymentOptions);
  if (!option) {
    throw new Error('Wise /v3/quotes/ returned no payment options');
  }
  const send = option.sourceAmount ?? data.sourceAmount ?? sendAmount;
  const receive = option.targetAmount ?? send * data.rate;
  const fee = option.fee?.total ?? 0;
  return {
    providerId: 'wise',
    dataSource: 'wise_quote',
    pair,
    sendAmount: send,
    receiveAmount: receive,
    rate: data.rate,
    feeAmount: fee,
    capturedAt: new Date(),
    raw: { source: 'wise_v3_quotes', payIn: option.payIn, payOut: option.payOut },
  };
}

async function fetchViaComparisons(pair: CurrencyPair, sendAmount: number): Promise<Quote> {
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
  const send = q.sourceAmount ?? data.sourceAmount ?? sendAmount;
  return {
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
}

function pickPaymentOption(options: WiseQuoteResponse['paymentOptions']) {
  // Prefer non-disabled options (those a customer in our geo can actually use)
  // and among those, the lowest total fee.
  const enabled = options.filter((o) => !o.disabled);
  const pool = enabled.length > 0 ? enabled : options;
  if (pool.length === 0) return undefined;
  return pool.reduce((best, cur) =>
    (cur.fee?.total ?? Number.POSITIVE_INFINITY) < (best.fee?.total ?? Number.POSITIVE_INFINITY)
      ? cur
      : best,
  );
}
