import { withPage } from '../../scrape/browserPool.js';
import type { ReferenceRate, ReferenceSource } from '../types.js';

// Google Finance — known to lag the market by 5-15 minutes. Tracked separately
// for display only; deliberately excluded from the mid-market median.
//
// Selectors verified live (2026-04): the price is rendered into a
// `<div class="N6SYTe">` with mirrored `<span jsname="Pdsbrc">` elements.
// We try the dedicated class first (more stable than the obfuscated jsname,
// which also matches dozens of unrelated tickers in the sidebar).
//
// EU egress note: Hetzner DE and other EU IPs hit the `consent.google.com`
// interstitial before the finance page renders. We force US locale via
// `?hl=en&gl=US` and skip consent by setting the CONSENT cookie up-front.

function pageUrl(from: string, to: string): string {
  return `https://www.google.com/finance/quote/${from}-${to}?hl=en&gl=US`;
}

export const googleFinanceSource: ReferenceSource = {
  id: 'googleFinance',
  displayName: 'Google Finance',

  async fetchRate({ pair }): Promise<ReferenceRate> {
    const rate = await withPage(async (page) => {
      // Pre-set the consent cookie so Google doesn't bounce us through
      // consent.google.com on EU egress (CONSENT=YES+... is the well-known
      // "I accept" sentinel value Google uses).
      await page.context().addCookies([
        {
          name: 'CONSENT',
          value: 'YES+',
          domain: '.google.com',
          path: '/',
          expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600,
        },
      ]);

      await page.goto(pageUrl(pair.from, pair.to), {
        waitUntil: 'domcontentloaded',
        timeout: 25_000,
      });

      // If we still landed on consent.google.com, click the "Reject all"
      // button (any choice unblocks navigation; reject is the most explicit).
      if (page.url().includes('consent.google.com')) {
        await page
          .locator('button:has-text("Reject all"), button:has-text("Accept all")')
          .first()
          .click({ timeout: 5_000 })
          .catch(() => {});
        await page.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => {});
      }

      // Wait for the price to render. Don't swallow this — it's the signal
      // that the page actually loaded the quote card.
      await page.waitForSelector('div.N6SYTo, div.N6SYTe', { timeout: 20_000 });

      // INLINE the lookup (no nested function declarations) — tsx/esbuild
      // injects a __name helper around named function expressions, which is
      // NOT available in the browser context Playwright uses for page.evaluate.
      const lo = pair.from === 'USD' ? 60 : 18;
      const hi = pair.from === 'USD' ? 130 : 35;
      const r = await page.evaluate(
        ({ lo, hi }) => {
          // 1. The dedicated quote card. div.N6SYTe contains exactly the
          //    page's primary quote on US-locale renders.
          const selectors = ['div.N6SYTe', 'div.N6SYTo', '[jsname="Pdsbrc"]'];
          for (const sel of selectors) {
            const els = Array.from(document.querySelectorAll(sel));
            for (const el of els) {
              const text = (el.textContent ?? '').trim().replace(/,/g, '');
              const m = text.match(/^(\d{1,4}(?:\.\d{1,6})?)$/);
              if (m && m[1]) {
                const v = parseFloat(m[1]);
                if (Number.isFinite(v) && v > lo && v < hi) return v;
              }
            }
          }
          // 2. Fallback: walk all text nodes, return the first number-only
          //    node whose value falls in the corridor's plausible range.
          //    Catches future class-name churn without being too liberal.
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
          let n: Node | null;
          while ((n = walker.nextNode())) {
            const t = (n.textContent ?? '').trim().replace(/,/g, '');
            const m = t.match(/^(\d{1,4}(?:\.\d{1,6})?)$/);
            if (m && m[1]) {
              const v = parseFloat(m[1]);
              if (Number.isFinite(v) && v > lo && v < hi) return v;
            }
          }
          return null;
        },
        { lo, hi },
      );

      if (r == null) {
        throw new Error(
          `Google Finance rate not found (url=${page.url()}, selector + range-walker both empty)`,
        );
      }
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
