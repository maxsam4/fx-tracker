import { httpJson } from '../../scrape/httpClient.js';
import type { ReferenceRate, ReferenceSource } from '../types.js';

// Frankfurter is a free, no-auth ECB-derived FX feed. Updated daily (~16:00
// CET) directly from the European Central Bank's reference rates table.
//
// Endpoint:
//   GET https://api.frankfurter.dev/v1/latest?base=USD&symbols=INR
// Response:
//   {"amount":1.0, "base":"USD", "date":"YYYY-MM-DD", "rates":{"INR":94.92}}
//
// Caveat: ECB only tracks ~30 currencies, AED is not one of them. We throw
// for unsupported bases (e.g. AED-INR) — `computeMidMarket` records the
// failure in perSource and just doesn't include this source in that pair's
// median. The user-facing impact is "Frankfurter contributes to USD-INR
// only, not AED-INR".

const ENDPOINT = 'https://api.frankfurter.dev/v1/latest';

interface FrankfurterResponse {
  amount?: number;
  base?: string;
  date?: string;
  rates?: Record<string, number>;
  message?: string; // present on errors, e.g. {"message":"not found"}
}

export const frankfurterSource: ReferenceSource = {
  id: 'frankfurter',
  displayName: 'Frankfurter (ECB)',

  async fetchRate({ pair }): Promise<ReferenceRate> {
    const url = `${ENDPOINT}?base=${encodeURIComponent(pair.from)}&symbols=${encodeURIComponent(pair.to)}`;
    const data = await httpJson<FrankfurterResponse>(url, { timeoutMs: 12_000 });
    if (data.message) {
      throw new Error(`Frankfurter: ${data.message} (likely unsupported currency for ${pair.from}-${pair.to})`);
    }
    const rate = data.rates?.[pair.to];
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
      throw new Error(`Frankfurter: missing or invalid rate for ${pair.to}`);
    }
    // The `date` field is the ECB business day the rate applies to (YYYY-MM-DD,
    // local CET — but YYYY-MM-DD is timezone-agnostic). We anchor it at midnight
    // UTC of that date as the canonical capturedAt. ECB actually publishes
    // around 16:00 CET, but a deterministic per-day timestamp is what the
    // dedup logic in pollRates needs (so subsequent hourly polls of the same
    // ECB business day skip the duplicate write).
    const capturedAt =
      typeof data.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.date)
        ? new Date(`${data.date}T00:00:00Z`)
        : new Date();
    return {
      sourceId: 'frankfurter',
      pair,
      rate,
      capturedAt,
      raw: data,
    };
  },
};
