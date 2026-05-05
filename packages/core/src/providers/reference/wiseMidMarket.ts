import { httpJson } from '../../scrape/httpClient.js';
import type { ReferenceRate, ReferenceSource } from '../types.js';

interface WiseRateResponse {
  source?: string;
  target?: string;
  value: number;
  // Live endpoint returns a 13-digit Unix-millisecond timestamp.
  time?: number;
}

// Wise's public mid-market rate endpoint: /rates/live?source=USD&target=INR
// Returns the exact rate Wise shows on their homepage. No auth required.
export const wiseMidMarketSource: ReferenceSource = {
  id: 'wiseMidMarket',
  displayName: 'Wise (mid-market)',

  async fetchRate({ pair }): Promise<ReferenceRate> {
    const url = new URL('https://wise.com/rates/live');
    url.searchParams.set('source', pair.from);
    url.searchParams.set('target', pair.to);
    const data = await httpJson<WiseRateResponse>(url.toString(), { timeoutMs: 12_000 });
    if (typeof data.value !== 'number') {
      throw new Error('Wise mid-market response missing `value`');
    }
    const capturedAt =
      typeof data.time === 'number' ? new Date(data.time) : new Date();
    return {
      sourceId: 'wiseMidMarket',
      pair,
      rate: data.value,
      capturedAt,
      raw: data,
    };
  },
};
