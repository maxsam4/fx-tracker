import { httpJson } from '../../scrape/httpClient.js';
import type { ReferenceRate, ReferenceSource } from '../types.js';

interface OpenErApiResponse {
  result: 'success' | 'error';
  rates: Record<string, number>;
  time_last_update_unix?: number;
}

// Free, no-key public FX endpoint. We use open.er-api.com which is the
// successor to exchangerate.host's free tier. Hourly cadence is fine for
// our purposes; the response is not authoritative but useful as a third
// vote in the median.
export const exchangerateHostSource: ReferenceSource = {
  id: 'exchangerateHost',
  displayName: 'open.er-api.com',

  async fetchRate({ pair }): Promise<ReferenceRate> {
    const url = `https://open.er-api.com/v6/latest/${encodeURIComponent(pair.from)}`;
    const data = await httpJson<OpenErApiResponse>(url, { timeoutMs: 12_000 });
    if (data.result !== 'success') {
      throw new Error(`exchangerate-host returned non-success: ${data.result}`);
    }
    const rate = data.rates?.[pair.to];
    if (typeof rate !== 'number') {
      throw new Error(`exchangerate-host missing rate for ${pair.to}`);
    }
    return {
      sourceId: 'exchangerateHost',
      pair,
      rate,
      capturedAt: new Date(),
      raw: data,
    };
  },
};
