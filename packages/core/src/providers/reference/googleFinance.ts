import { withPage } from '../../scrape/browserPool.js';
import type { ReferenceRate, ReferenceSource } from '../types.js';

// Google Finance — known to lag the market by 5-15 minutes. Tracked separately
// for display only; deliberately excluded from the mid-market median.
//
// Selectors verified live (2026-04): the price is rendered into a
// `<div class="N6SYTe">` with mirrored `<span jsname="Pdsbrc">` elements.
// We try the jsname first (more stable than the obfuscated class name).

function pageUrl(from: string, to: string): string {
  return `https://www.google.com/finance/quote/${from}-${to}`;
}

export const googleFinanceSource: ReferenceSource = {
  id: 'googleFinance',
  displayName: 'Google Finance',

  async fetchRate({ pair }): Promise<ReferenceRate> {
    const rate = await withPage(async (page) => {
      await page.goto(pageUrl(pair.from, pair.to), {
        waitUntil: 'domcontentloaded',
        timeout: 25_000,
      });
      // Wait for the price to render.
      await page
        .waitForSelector('div.N6SYTe', { timeout: 15_000 })
        .catch(() => {});

      // INLINE the lookup (no nested function declarations) — tsx/esbuild
      // injects a __name helper around named function expressions, which is
      // NOT available in the browser context Playwright uses for page.evaluate.
      // div.N6SYTe contains exactly the page's primary quote (verified live).
      // [jsname="Pdsbrc"] matches dozens of unrelated tickers in the sidebar,
      // so the specific class is preferred.
      const r = await page.evaluate(() => {
        const selectors = ['div.N6SYTe', '[jsname="Pdsbrc"]'];
        for (const sel of selectors) {
          const els = Array.from(document.querySelectorAll(sel));
          for (const el of els) {
            const text = (el.textContent ?? '').trim().replace(/,/g, '');
            const m = text.match(/^(\d{1,4}(?:\.\d{1,6})?)$/);
            if (m && m[1]) {
              const v = parseFloat(m[1]);
              if (Number.isFinite(v) && v > 0) return v;
            }
          }
        }
        return null;
      });

      if (r == null) throw new Error('Google Finance rate not found');
      return r;
    });

    return {
      sourceId: 'googleFinance',
      pair,
      rate,
      capturedAt: new Date(),
      raw: { source: 'googleFinance' },
    };
  },
};
