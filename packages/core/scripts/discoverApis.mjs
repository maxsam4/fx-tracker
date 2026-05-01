// Visit each provider site with Playwright; log every XHR/fetch the page makes.
// Goal: identify direct JSON APIs we can call instead of scraping rendered HTML.
//
// Usage:  node scripts/discoverApis.mjs [site]
//   site: optional filter — masarif | lulu | aspora | careem | remitfinder | wu | google

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ONLY = process.argv[2];
const OUT_DIR = path.join(process.cwd(), '.discovery');
fs.mkdirSync(OUT_DIR, { recursive: true });

const TARGETS = [
  { id: 'masarif', url: 'https://www.masarif.ae/', wait: 8000 },
  { id: 'lulu', url: 'https://www.lulumoney.com/index.php?country=UAE#/', wait: 10000 },
  { id: 'aspora', url: 'https://aspora.com/', wait: 8000 },
  { id: 'careem', url: 'https://www.careempay.com/en-ae/send-money-to-india', wait: 8000 },
  { id: 'remitfinder', url: 'https://www.remitfinder.com/exchangeRates/usd-to-inr', wait: 12000 },
  { id: 'wu', url: 'https://www.westernunion.com/us/en/web/send-money/start', wait: 10000 },
  { id: 'google', url: 'https://www.google.com/finance/quote/USD-INR', wait: 6000 },
];

const filtered = ONLY ? TARGETS.filter((t) => t.id === ONLY) : TARGETS;

const browser = await chromium.launch({ headless: true });

for (const target of filtered) {
  const ctx = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
    viewport: { width: 1280, height: 900 },
    locale: 'en-US',
  });
  const page = await ctx.newPage();
  const captured = [];

  page.on('request', (req) => {
    const t = req.resourceType();
    if (t === 'xhr' || t === 'fetch') {
      captured.push({ method: req.method(), url: req.url(), type: t });
    }
  });

  page.on('response', async (res) => {
    const req = res.request();
    const t = req.resourceType();
    if (t !== 'xhr' && t !== 'fetch') return;
    const ct = res.headers()['content-type'] ?? '';
    let bodyPreview = '';
    try {
      if (ct.includes('json')) {
        const txt = await res.text();
        bodyPreview = txt.length > 800 ? txt.slice(0, 800) + '... [truncated]' : txt;
      }
    } catch {
      // ignore body read errors (request may have been canceled)
    }
    const idx = captured.findIndex(
      (e) => e.url === req.url() && e.method === req.method() && !e.status,
    );
    if (idx >= 0) {
      captured[idx].status = res.status();
      captured[idx].contentType = ct;
      captured[idx].bodyPreview = bodyPreview;
    }
  });

  console.log(`\n=== ${target.id} :: ${target.url} ===`);
  try {
    await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(target.wait);
  } catch (err) {
    console.log(`  navigation error: ${err.message}`);
  }

  // Filter to JSON-y traffic for readability
  const jsonish = captured.filter(
    (c) => (c.contentType ?? '').includes('json') || /\.json(\?|$)/i.test(c.url),
  );
  console.log(`  captured ${captured.length} XHR/fetch (${jsonish.length} JSON)`);
  for (const c of jsonish) {
    console.log(`  [${c.status ?? '?'}] ${c.method} ${c.url}`);
  }

  // Persist full capture for inspection
  const out = path.join(OUT_DIR, `${target.id}.json`);
  fs.writeFileSync(out, JSON.stringify(captured, null, 2));
  console.log(`  -> ${out}`);

  // Also save the rendered DOM in case API discovery fails
  try {
    const html = await page.content();
    fs.writeFileSync(path.join(OUT_DIR, `${target.id}.html`), html);
  } catch {}

  await ctx.close();
}

await browser.close();
console.log('\nDone.');
