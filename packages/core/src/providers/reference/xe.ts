import { httpText } from '../../scrape/httpClient.js';
import { withPage } from '../../scrape/browserPool.js';
import type { ReferenceRate, ReferenceSource } from '../types.js';

// XE doesn't have a free public API but their currency converter page renders
// the rate server-side. Live probe (2026-04) shows plain HTTP works without
// JS execution; the Playwright fallback is only for the case where Cloudflare
// challenges us.

function pageUrl(from: string, to: string): string {
  const url = new URL('https://www.xe.com/currencyconverter/convert/');
  url.searchParams.set('Amount', '1');
  url.searchParams.set('From', from);
  url.searchParams.set('To', to);
  return url.toString();
}

// Hardcoded regexes per supported corridor — avoid dynamic RegExp construction.
const PATTERNS: Record<string, RegExp> = {
  'USD-INR': /1\s*USD\s*=\s*(\d+(?:\.\d+)?)\s*INR/i,
  'AED-INR': /1\s*AED\s*=\s*(\d+(?:\.\d+)?)\s*INR/i,
};

function parseRate(html: string, pairKey: string): number | null {
  const re = PATTERNS[pairKey];
  if (!re) return null;
  const m = html.match(re);
  return m?.[1] ? parseFloat(m[1]) : null;
}

export const xeSource: ReferenceSource = {
  id: 'xe',
  displayName: 'XE',

  async fetchRate({ pair }): Promise<ReferenceRate> {
    const pairKey = `${pair.from}-${pair.to}`;
    if (!PATTERNS[pairKey]) {
      throw new Error(`XE: pair ${pairKey} not configured`);
    }

    let rate: number | null = null;

    try {
      const html = await httpText(pageUrl(pair.from, pair.to), { timeoutMs: 12_000 });
      rate = parseRate(html, pairKey);
    } catch {
      // fall through to browser
    }

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
        const parsed = parseRate(text, pairKey);
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
      raw: { from: pair.from, to: pair.to },
    };
  },
};
