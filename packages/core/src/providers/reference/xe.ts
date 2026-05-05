import { httpFetch, httpText } from '../../scrape/httpClient.js';
import { withPage } from '../../scrape/browserPool.js';
import type { ReferenceRate, ReferenceSource } from '../types.js';

// XE has no public API, but the consumer SPA at xe.com calls a per-pair live
// rate feed at /api/protected/live-currency-pairs-rates/. The endpoint requires
// an Authorization: Basic header whose credentials are hardcoded into XE's
// own SPA bundle — they're effectively a "no anonymous traffic" filter, not
// real auth, and they're world-readable in the bundle. Response shape:
//   [{ from: "AED", to: "INR", rate: 25.8905..., trend, rateChange, ... }, ...]
// We pass the exact pair we want (e.g. AED/INR) so the rate comes back
// directly, NOT computed from USD-base cross rates — important so peg drift
// in rates.AED doesn't muddy AED-INR.
//
// We prefer this over the HTML scrape because:
//   1. The HTML scrape goes through the public CDN-cached page (stale by minutes).
//   2. No selector/regex risk on minor markup changes.
//
// Fallback waterfall: API → plain HTML → Playwright (Cloudflare bypass).
//
// If XE ever rotates the credential, override via XE_API_AUTH (full
// "Basic <base64>" string) without redeploying — regrep their main bundle
// for `Authorization` to find the new pair.

const API_BASE = 'https://www.xe.com/api/protected/live-currency-pairs-rates/';
// Default = the credential discovered in XE's SPA bundle (lodestar:pugsnax).
// It's not a secret — anyone visiting xe.com sees the same value in DevTools.
const DEFAULT_API_AUTH = `Basic ${Buffer.from('lodestar:pugsnax').toString('base64')}`;
const API_AUTH = process.env.XE_API_AUTH ?? DEFAULT_API_AUTH;

interface PairRate {
  from: string;
  to: string;
  rate: number;
  trend?: 'up' | 'down' | null;
  rateChange?: number;
  percentageChange?: number;
}

const SUPPORTED = new Set(['USD-INR', 'AED-INR']);

function pageUrl(from: string, to: string): string {
  const url = new URL('https://www.xe.com/currencyconverter/convert/');
  url.searchParams.set('Amount', '1');
  url.searchParams.set('From', from);
  url.searchParams.set('To', to);
  return url.toString();
}

function apiUrl(from: string, to: string): string {
  // Cachebuster `_=<ts>` to keep the CDN edge from serving a stale entry.
  return `${API_BASE}?currencyPairs=${from}%2F${to}&_=${Date.now()}`;
}

// Hardcoded regexes per supported corridor — avoid dynamic RegExp construction.
const PATTERNS: Record<string, RegExp> = {
  'USD-INR': /1\s*USD\s*=\s*(\d+(?:\.\d+)?)\s*INR/i,
  'AED-INR': /1\s*AED\s*=\s*(\d+(?:\.\d+)?)\s*INR/i,
};

function parseRateFromHtml(html: string, pairKey: string): number | null {
  const re = PATTERNS[pairKey];
  if (!re) return null;
  const m = html.match(re);
  return m?.[1] ? parseFloat(m[1]) : null;
}

async function fetchFromApi(
  pair: { from: string; to: string },
): Promise<{ rate: number; raw: PairRate } | null> {
  const res = await httpFetch(apiUrl(pair.from, pair.to), {
    headers: {
      Authorization: API_AUTH,
      Accept: 'application/json',
      Referer: 'https://www.xe.com/currencyconverter/convert/',
    },
    timeoutMs: 10_000,
  });
  if (!res.ok) return null;
  const data = (await res.json()) as PairRate[];
  const row = Array.isArray(data)
    ? data.find((r) => r.from === pair.from && r.to === pair.to)
    : null;
  if (!row || typeof row.rate !== 'number' || !Number.isFinite(row.rate)) return null;
  return { rate: row.rate, raw: row };
}

export const xeSource: ReferenceSource = {
  id: 'xe',
  displayName: 'XE',

  async fetchRate({ pair }): Promise<ReferenceRate> {
    const pairKey = `${pair.from}-${pair.to}`;
    if (!SUPPORTED.has(pairKey)) {
      throw new Error(`XE: pair ${pairKey} not configured`);
    }

    // Path 1: live pair rate JSON feed (preferred — direct per-pair quote).
    try {
      const api = await fetchFromApi(pair);
      if (api && Number.isFinite(api.rate)) {
        return {
          sourceId: 'xe',
          pair,
          rate: api.rate,
          capturedAt: new Date(),
          raw: { via: 'api', ...api.raw },
        };
      }
    } catch {
      // fall through to HTML
    }

    // Path 2: plain HTML scrape (regex-on-server-rendered).
    let rate: number | null = null;
    try {
      const html = await httpText(pageUrl(pair.from, pair.to), { timeoutMs: 12_000 });
      rate = parseRateFromHtml(html, pairKey);
    } catch {
      // fall through to browser
    }

    // Path 3: Playwright (Cloudflare-challenged loads).
    if (rate == null) {
      rate = await withPage(async (page) => {
        await page.goto(pageUrl(pair.from, pair.to), {
          waitUntil: 'domcontentloaded',
          timeout: 25_000,
        });
        await page
          .waitForSelector('main, body', { timeout: 8_000 })
          .catch(() => {});
        const text = await page.evaluate(() => document.body.innerText);
        const parsed = parseRateFromHtml(text, pairKey);
        if (parsed == null) throw new Error('XE rate not found in rendered page');
        return parsed;
      });
    }

    if (typeof rate !== 'number' || !Number.isFinite(rate)) {
      throw new Error(`XE rate parse failed for ${pairKey}`);
    }

    return {
      sourceId: 'xe',
      pair,
      rate,
      capturedAt: new Date(),
      raw: { via: 'html', from: pair.from, to: pair.to },
    };
  },
};
