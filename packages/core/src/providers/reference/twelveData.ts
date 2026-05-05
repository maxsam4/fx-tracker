import { httpJson } from '../../scrape/httpClient.js';
import type { ReferenceRate, ReferenceSource } from '../types.js';

// Twelve Data: free tier 800 calls/day, requires an API key. Endpoint:
//   GET https://api.twelvedata.com/exchange_rate?symbol=USD/INR&apikey=<key>
// Response: { symbol, rate, timestamp }
//
// Configured via the TWELVE_DATA_API_KEY env var. If unset, fetchRate
// throws — `computeMidMarket` swallows that and just leaves the source
// out of the median. Production deployments without the key will not
// see this feed contribute, which is the desired no-op fallback.

const ENDPOINT = 'https://api.twelvedata.com/exchange_rate';

interface TwelveDataResponse {
  symbol?: string;
  rate?: number;
  timestamp?: number;
  status?: 'ok' | 'error';
  code?: number;
  message?: string;
}

export const twelveDataSource: ReferenceSource = {
  id: 'twelveData',
  displayName: 'Twelve Data',

  async fetchRate({ pair }): Promise<ReferenceRate> {
    const apikey = process.env.TWELVE_DATA_API_KEY;
    if (!apikey) {
      throw new Error('TWELVE_DATA_API_KEY not set — twelveData source disabled');
    }
    const url = `${ENDPOINT}?symbol=${encodeURIComponent(`${pair.from}/${pair.to}`)}&apikey=${encodeURIComponent(apikey)}`;
    const data = await httpJson<TwelveDataResponse>(url, { timeoutMs: 12_000 });
    if (data.status === 'error' || typeof data.rate !== 'number') {
      throw new Error(
        `twelveData: ${data.message ?? `unexpected response (status=${data.status ?? 'n/a'})`}`,
      );
    }
    const capturedAt =
      typeof data.timestamp === 'number' ? new Date(data.timestamp * 1000) : new Date();
    return {
      sourceId: 'twelveData',
      pair,
      rate: data.rate,
      capturedAt,
      raw: data,
    };
  },
};
