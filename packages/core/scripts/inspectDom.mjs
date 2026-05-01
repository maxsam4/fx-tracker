// Inspect the actual rendered DOM of each target site after JS hydration.
// We extract the body text + page title, look for INR/USD-shaped numbers,
// and dump the first 3 elements containing them so we can write real selectors.
import { chromium } from 'playwright';

const TARGETS = [
  { id: 'google', url: 'https://www.google.com/finance/quote/USD-INR' },
  { id: 'masarif-home', url: 'https://www.masarif.ae/' },
  { id: 'masarif-india', url: 'https://www.masarif.ae/en/india' },
  { id: 'masarif-rates', url: 'https://www.masarif.ae/rates' },
  { id: 'remitfinder', url: 'https://www.remitfinder.com/exchangeRates/usd-to-inr' },
  { id: 'careem', url: 'https://www.careempay.com/en-ae/send-money-to-india' },
];

const browser = await chromium.launch({ headless: true });

for (const t of TARGETS) {
  process.stdout.write(`\n=== ${t.id} ===\n`);
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
    viewport: { width: 1280, height: 900 },
    locale: 'en-US',
  });
  const page = await ctx.newPage();
  try {
    await page.goto(t.url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForTimeout(6000);
    const result = await page.evaluate(() => {
      const text = document.body.innerText.replace(/\s+/g, ' ').trim().slice(0, 400);
      // Find first 5 elements containing numbers that look like FX rates
      const all = Array.from(document.querySelectorAll('*'));
      const matches = [];
      for (const el of all) {
        const own = (el.textContent ?? '').trim();
        if (!own) continue;
        const m = own.match(/^(\d{1,3}\.\d{2,6})$/);
        if (m && parseFloat(m[1]) > 18 && parseFloat(m[1]) < 130) {
          matches.push({
            tag: el.tagName.toLowerCase(),
            classes: (el.getAttribute('class') ?? '').slice(0, 80),
            id: el.id || null,
            attrs: Array.from(el.attributes).map(a => a.name + (a.value ? '=' + a.value.slice(0, 30) : '')),
            text: own.slice(0, 50),
          });
          if (matches.length >= 5) break;
        }
      }
      // Look for elements with data-* attributes that might have prices
      const dataAttrs = [];
      for (const el of all) {
        for (const a of el.attributes ?? []) {
          if (a.name.startsWith('data-') && /price|rate|value/i.test(a.name)) {
            dataAttrs.push({ tag: el.tagName.toLowerCase(), attr: a.name, val: a.value.slice(0, 30) });
            if (dataAttrs.length >= 5) return { text, matches, dataAttrs };
          }
        }
      }
      return { text, matches, dataAttrs };
    });
    process.stdout.write(`text: ${result.text}\n`);
    process.stdout.write(`rate-shaped exact-match elements: ${result.matches.length}\n`);
    for (const m of result.matches) {
      process.stdout.write(`  <${m.tag}>${m.text}</${m.tag}>\n`);
      process.stdout.write(`    classes: ${m.classes}\n`);
      process.stdout.write(`    id: ${m.id}\n`);
      const interestingAttrs = m.attrs.filter(a => /data|jsname|aria|class/.test(a)).slice(0, 5);
      if (interestingAttrs.length) process.stdout.write(`    attrs: ${interestingAttrs.join(' ')}\n`);
    }
    process.stdout.write(`data-* price/rate attrs: ${result.dataAttrs.length}\n`);
    for (const d of result.dataAttrs) process.stdout.write(`  <${d.tag} ${d.attr}="${d.val}">\n`);
  } catch (err) {
    process.stdout.write(`error: ${err.message}\n`);
  }
  await ctx.close();
}

await browser.close();
process.stdout.write('\nDone.\n');
