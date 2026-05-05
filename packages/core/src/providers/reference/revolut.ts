import { httpJson } from '../../scrape/httpClient.js';
import type { ReferenceRate, ReferenceSource } from '../types.js';

// Revolut's consumer FX-converter page (revolut.com/currency-converter)
// pulls live charts from /api/exchange/fx-charts/<PAIR> with no auth.
// The endpoint accepts `interval` (1m, 5m, 1d, ...) and `range` (1d, 1y).
//   GET https://www.revolut.com/api/exchange/fx-charts/USDINR?interval=5m&range=1d&region=GB
// Response: { previousRangeCloseRate, points: [{ start, rate }] }
// `points` is chronological — last entry is the freshest spot rate.
//
// `region=GB` is required by the gateway; it does not affect the rate
// (it's a routing hint). 5-minute granularity over a 1-day range gives
// us a fresh spot rate within minutes.

const API_BASE = 'https://www.revolut.com/api/exchange/fx-charts/';

interface RevolutChartResponse {
  previousRangeCloseRate?: string;
  points: Array<{ start: number; rate: string }>;
}

const SUPPORTED = new Set(['USD-INR', 'AED-INR']);

export const revolutSource: ReferenceSource = {
  id: 'revolut',
  displayName: 'Revolut',

  async fetchRate({ pair }): Promise<ReferenceRate> {
    const pairKey = `${pair.from}-${pair.to}`;
    if (!SUPPORTED.has(pairKey)) {
      throw new Error(`revolut: pair ${pairKey} not configured`);
    }

    const symbol = `${pair.from}${pair.to}`;
    const url = `${API_BASE}${symbol}?interval=5m&range=1d&region=GB`;
    const data = await httpJson<RevolutChartResponse>(url, { timeoutMs: 12_000 });

    const points = Array.isArray(data.points) ? data.points : [];
    const last = points[points.length - 1];
    const rate = last ? Number(last.rate) : NaN;
    if (!Number.isFinite(rate)) {
      throw new Error(`revolut: no chart points for ${symbol}`);
    }

    return {
      sourceId: 'revolut',
      pair,
      rate,
      capturedAt: typeof last!.start === 'number' ? new Date(last!.start) : new Date(),
      raw: { symbol, lastPoint: last, pointsCount: points.length },
    };
  },
};
