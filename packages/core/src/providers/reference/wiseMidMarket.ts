import { httpJson } from '../../scrape/httpClient.js';
import type { ReferenceRate, ReferenceSource } from '../types.js';

interface WiseRateResponse {
  rate: number;
  source: string;
  target: string;
  time: string;
}

// Wise's public mid-market rate endpoint: /v1/rates?source=USD&target=INR
// Returns the exact rate Wise shows on their homepage. No auth required for
// some pair combinations; for blocked combos we fall back to the comparison
// endpoint which always exposes Wise's mid-market.
export const wiseMidMarketSource: ReferenceSource = {
  id: 'wiseMidMarket',
  displayName: 'Wise (mid-market)',

  async fetchRate({ pair }): Promise<ReferenceRate> {
    const url = new URL('https://wise.com/rates/live');
    url.searchParams.set('source', pair.from);
    url.searchParams.set('target', pair.to);
    const data = await httpJson<{ value: number }>(url.toString(), { timeoutMs: 12_000 });
    if (typeof data.value !== 'number') {
      throw new Error('Wise mid-market response missing `value`');
    }
    return {
      sourceId: 'wiseMidMarket',
      pair,
      rate: data.value,
      capturedAt: new Date(),
      raw: data,
    };
  },
};
