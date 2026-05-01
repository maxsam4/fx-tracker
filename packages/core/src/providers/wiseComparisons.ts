// Shared helper: Wise's comparison endpoint returns quotes for many competing
// remittance providers in a single call (Wise, Remitly, Xoom, Western Union,
// Instarem, MoneyGram, etc.). We memoize the response briefly so that each
// provider plugin can call it without flooding Wise.

import { httpJson } from '../scrape/httpClient.js';
import type { CurrencyPair } from '../types.js';
import type { Quote } from './types.js';

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

const TTL_MS = 60_000; // memoize for one minute
const cache = new Map<string, { at: number; data: WiseComparisonResponse }>();

/** Test-only: clear the in-process cache between tests. */
export function __resetWiseComparisonCache(): void {
  cache.clear();
}

function cacheKey(pair: CurrencyPair, sendAmount: number): string {
  return `${pair.from}-${pair.to}-${sendAmount}`;
}

export async function fetchWiseComparison(
  pair: CurrencyPair,
  sendAmount: number,
): Promise<WiseComparisonResponse> {
  const k = cacheKey(pair, sendAmount);
  const cached = cache.get(k);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.data;

  const url = new URL('https://api.wise.com/v3/comparisons/');
  url.searchParams.set('sourceCurrency', pair.from);
  url.searchParams.set('targetCurrency', pair.to);
  url.searchParams.set('sendAmount', String(sendAmount));

  const data = await httpJson<WiseComparisonResponse>(url.toString(), { timeoutMs: 15_000 });
  cache.set(k, { at: Date.now(), data });
  return data;
}

/** Extract a Quote for a specific provider alias from a Wise comparison response.
 *
 * `requestedSendAmount` is the amount we asked for in the original API call —
 * used as the final fallback when neither the per-quote nor the response-level
 * sourceAmount is populated (some corridors omit it). Without this fallback,
 * an undefined sendAmount surfaces as `Cannot read properties of undefined`
 * at persist time.
 */
export function quoteFromWiseComparison(
  data: WiseComparisonResponse,
  pair: CurrencyPair,
  providerAliases: string[],
  providerId: string,
  requestedSendAmount?: number,
): Quote {
  const lower = providerAliases.map((a) => a.toLowerCase());
  const entry = data.providers.find(
    (p) =>
      lower.includes(p.alias?.toLowerCase() ?? '') ||
      lower.includes(p.name?.toLowerCase() ?? ''),
  );
  if (!entry || entry.quotes.length === 0) {
    throw new Error(`No quote found in Wise comparison for ${providerAliases.join('|')}`);
  }
  const q = entry.quotes[0]!;
  const sendAmount = q.sourceAmount ?? data.sourceAmount ?? requestedSendAmount;
  if (sendAmount == null) {
    throw new Error(
      `Wise comparison missing sourceAmount for ${providerId}; provide requestedSendAmount`,
    );
  }
  const receiveAmount = q.receivedAmount ?? q.targetAmount;
  if (receiveAmount == null) {
    throw new Error(`Wise comparison missing receive amount for ${providerId}`);
  }
  return {
    providerId,
    dataSource: 'wise_comparisons',
    pair,
    sendAmount,
    receiveAmount,
    rate: q.rate,
    feeAmount: q.fee ?? 0,
    capturedAt: new Date(),
    raw: { wiseProviderEntry: entry },
  };
}
