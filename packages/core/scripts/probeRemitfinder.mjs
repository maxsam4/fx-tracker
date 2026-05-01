import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  viewport: { width: 1280, height: 900 },
});
const page = await ctx.newPage();

const captured = [];
page.on('request', (req) => {
  if (req.resourceType() === 'xhr' || req.resourceType() === 'fetch') {
    captured.push({ method: req.method(), url: req.url() });
  }
});
page.on('response', async (res) => {
  const req = res.request();
  if (req.resourceType() !== 'xhr' && req.resourceType() !== 'fetch') return;
  const ct = res.headers()['content-type'] ?? '';
  if (!ct.includes('json')) return;
  try {
    const body = await res.text();
    const idx = captured.findIndex(e => e.url === req.url() && e.method === req.method());
    if (idx >= 0) {
      captured[idx].status = res.status();
      captured[idx].body = body.slice(0, 1500);
    }
  } catch {}
});

const urls = [
  'https://www.remitfinder.com/exchangeRates/usd-to-inr',
  'https://www.remitfinder.com/exchangeRates/aed-to-inr',
];
for (const u of urls) {
  process.stdout.write(`\n=== ${u} ===\n`);
  await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(8000);

  // Inspect rate elements
  const result = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('.rate, [class*="rate"]'));
    return els.slice(0, 10).map(el => ({
      tag: el.tagName.toLowerCase(),
      cls: (el.getAttribute('class') ?? '').slice(0, 80),
      text: (el.textContent ?? '').trim().slice(0, 60),
    }));
  });
  process.stdout.write(`rate-class elements: ${result.length}\n`);
  for (const r of result) {
    process.stdout.write(`  <${r.tag} class="${r.cls}">${r.text}</${r.tag}>\n`);
  }

  // Inspect: get the entire rendered body that mentions providers like Wise/Remitly
  const providerRows = await page.evaluate(() => {
    const out = [];
    const all = Array.from(document.querySelectorAll('div, tr, li'));
    for (const el of all) {
      const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (/Wise|Remitly|Xoom|Instarem|Western/i.test(text) && text.length < 300) {
        out.push(text.slice(0, 200));
        if (out.length >= 6) break;
      }
    }
    return out;
  });
  process.stdout.write(`provider-mention rows: ${providerRows.length}\n`);
  for (const r of providerRows) process.stdout.write(`  - ${r}\n`);
}

process.stdout.write(`\n=== JSON XHRs captured ===\n`);
for (const c of captured) {
  if (!c.body) continue;
  process.stdout.write(`[${c.status}] ${c.method} ${c.url}\n  ${c.body.slice(0, 300)}\n`);
}

await browser.close();
