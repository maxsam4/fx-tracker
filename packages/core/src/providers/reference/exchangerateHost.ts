import { httpJson } from '../../scrape/httpClient.js';
import type { ReferenceRate, ReferenceSource } from '../types.js';

interface OpenErApiResponse {
  result: 'success' | 'error';
  rates: Record<string, number>;
  time_last_update_unix?: number;
  time_next_update_unix?: number;
}

// Free, no-key public FX endpoint. We use open.er-api.com which is the
// successor to exchangerate.host's free tier. The free tier refreshes
// only **once a day** — `time_last_update_unix` is the upstream
// republish moment. We surface that as `capturedAt` (rather than the
// fetch wall-clock) so downstream dedup can skip writing identical rows
// hour after hour, and so charts represent reality (a flat line for
// 24h, not a sawtooth of equal hourly readings).
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
    const capturedAt =
      typeof data.time_last_update_unix === 'number'
        ? new Date(data.time_last_update_unix * 1000)
        : new Date();
    return {
      sourceId: 'exchangerateHost',
      pair,
      rate,
      capturedAt,
      raw: data,
    };
  },
};
