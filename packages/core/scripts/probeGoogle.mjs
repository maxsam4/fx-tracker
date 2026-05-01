// Find the actual primary price element on Google Finance USD-INR.
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  viewport: { width: 1280, height: 900 },
});
const page = await ctx.newPage();
await page.goto('https://www.google.com/finance/quote/USD-INR', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(6000);

const result = await page.evaluate(() => {
  // Title element to anchor near
  const title = document.title;

  // All Pdsbrc elements with values + nearest ancestor heading
  const all = Array.from(document.querySelectorAll('[jsname="Pdsbrc"]'));
  const pdsbrc = all.slice(0, 12).map(el => {
    const t = (el.textContent ?? '').trim();
    // Find the nearest preceding heading or large-text ancestor
    let context = '';
    for (let p = el.parentElement; p && context.length < 200; p = p.parentElement) {
      const h = p.querySelector('h1, h2, h3, [role=heading]');
      if (h) { context = (h.textContent ?? '').trim().slice(0, 60); break; }
    }
    return { t, context };
  });

  // What's the very first big-text price?
  // Try common Google Finance selectors
  const candidates = [
    'div[role=main] [jsname="Pdsbrc"]',
    'main [jsname="Pdsbrc"]',
    '[role=heading] + * [jsname="Pdsbrc"]',
    'div.N6SYTe',
  ];
  const found = candidates.map(sel => ({
    sel,
    matches: Array.from(document.querySelectorAll(sel)).slice(0, 3).map(e => (e.textContent ?? '').trim()),
  }));

  // Also: find the element containing exactly "USD / INR" or "1 USD = X INR" text
  const usdInrCtx = (() => {
    const all = Array.from(document.querySelectorAll('h1, h2, [role=heading]'));
    for (const el of all) {
      const t = (el.textContent ?? '').trim();
      if (/USD.*Rupee|Rupee.*USD|US Dollar.*Indian/i.test(t)) {
        // Look for sibling/descendant rate
        let parent = el.parentElement;
        for (let i = 0; i < 5 && parent; i++) {
          const p = parent.querySelector('[jsname="Pdsbrc"], div.N6SYTe');
          if (p) {
            return { heading: t.slice(0, 80), price: (p.textContent ?? '').trim() };
          }
          parent = parent.parentElement;
        }
      }
    }
    return null;
  })();

  return { title, pdsbrc, found, usdInrCtx };
});

process.stdout.write(`title: ${result.title}\n\n`);
process.stdout.write(`pdsbrc elements (first 12):\n`);
for (const e of result.pdsbrc) process.stdout.write(`  "${e.t}"  context="${e.context}"\n`);
process.stdout.write(`\ncandidate selectors:\n`);
for (const c of result.found) process.stdout.write(`  ${c.sel}: ${JSON.stringify(c.matches)}\n`);
process.stdout.write(`\nusdInrCtx: ${JSON.stringify(result.usdInrCtx)}\n`);

await browser.close();
