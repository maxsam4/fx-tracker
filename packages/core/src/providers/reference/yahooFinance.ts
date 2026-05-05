import { httpJson } from '../../scrape/httpClient.js';
import type { ReferenceRate, ReferenceSource } from '../types.js';

// Yahoo Finance's chart API exposes spot FX with no key. Currency-pair
// symbols are concatenated with the `=X` suffix:
//   GET https://query1.finance.yahoo.com/v8/finance/chart/USDINR=X?interval=1m&range=1d
// Response (relevant fields):
//   { chart: { result: [{ meta: { regularMarketPrice, regularMarketTime, ... } }] } }
//
// Caveats:
//  - Yahoo sometimes blocks unauthenticated traffic from datacenter IP
//    ranges (Hetzner, AWS, GCP). When that happens the response is HTTP
//    200 with `chart.error` set; we throw, computeMidMarket drops it,
//    and the median proceeds without it. No retry magic here.
//  - `regularMarketTime` is unix seconds (UTC), used as `capturedAt`.

const ENDPOINT_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart/';

interface YahooChartResponse {
  chart: {
    error?: { code?: string; description?: string } | null;
    result?: Array<{
      meta: {
        symbol: string;
        regularMarketPrice?: number;
        regularMarketTime?: number;
        currency?: string;
      };
    }>;
  };
}

const SUPPORTED = new Set(['USD-INR', 'AED-INR']);

export const yahooFinanceSource: ReferenceSource = {
  id: 'yahooFinance',
  displayName: 'Yahoo Finance',

  async fetchRate({ pair }): Promise<ReferenceRate> {
    const pairKey = `${pair.from}-${pair.to}`;
    if (!SUPPORTED.has(pairKey)) {
      throw new Error(`yahooFinance: pair ${pairKey} not configured`);
    }

    const symbol = `${pair.from}${pair.to}=X`;
    const url = `${ENDPOINT_BASE}${encodeURIComponent(symbol)}?interval=1m&range=1d`;
    const data = await httpJson<YahooChartResponse>(url, {
      headers: {
        // Yahoo serves a different (smaller, JSON-only) response when this
        // mimics a browser; otherwise we sometimes get the HTML wrapper.
        Accept: 'application/json',
      },
      timeoutMs: 12_000,
    });

    if (data.chart?.error) {
      throw new Error(
        `yahooFinance: chart.error=${JSON.stringify(data.chart.error)}`,
      );
    }
    const meta = data.chart?.result?.[0]?.meta;
    const rate = meta?.regularMarketPrice;
    if (!meta || typeof rate !== 'number' || !Number.isFinite(rate)) {
      throw new Error(`yahooFinance: regularMarketPrice missing for ${symbol}`);
    }

    const capturedAt =
      typeof meta.regularMarketTime === 'number'
        ? new Date(meta.regularMarketTime * 1000)
        : new Date();

    return {
      sourceId: 'yahooFinance',
      pair,
      rate,
      capturedAt,
      raw: { symbol, meta },
    };
  },
};
