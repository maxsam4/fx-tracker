// Aggressive discovery: open each site, do realistic interactions to trigger
// quote XHRs (scroll, click corridor pickers, type send-amount).
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const OUT = '/Users/mgupta/Development/fx-tracker/packages/core/.discovery';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });

const log = (m) => process.stdout.write(m + '\n');

async function probe(target, interact) {
  const ctx = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
    viewport: { width: 1280, height: 900 },
    locale: 'en-US',
  });
  const page = await ctx.newPage();
  const captured = [];

  page.on('request', (req) => {
    if (req.resourceType() === 'xhr' || req.resourceType() === 'fetch') {
      let body = null;
      try { body = req.postData(); } catch {}
      captured.push({ method: req.method(), url: req.url(), body });
    }
  });
  page.on('response', async (res) => {
    const req = res.request();
    if (req.resourceType() !== 'xhr' && req.resourceType() !== 'fetch') return;
    const ct = res.headers()['content-type'] ?? '';
    let preview = '';
    try {
      if (ct.includes('json')) {
        const t = await res.text();
        preview = t.length > 1500 ? t.slice(0, 1500) + '...' : t;
      }
    } catch {}
    const idx = captured.findIndex((e) => e.url === req.url() && e.method === req.method() && !e.status);
    if (idx >= 0) Object.assign(captured[idx], { status: res.status(), contentType: ct, bodyPreview: preview });
  });

  log(`\n=== ${target.id} :: ${target.url} ===`);
  try {
    await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (e) {
    log(`  navigation: ${e.message}`);
  }

  if (interact) {
    try {
      await interact(page);
    } catch (e) {
      log(`  interact error: ${e.message}`);
    }
  }
  await page.waitForTimeout(target.wait ?? 8000);

  // Save raw + filtered
  fs.writeFileSync(path.join(OUT, `${target.id}-v2.json`), JSON.stringify(captured, null, 2));
  const interesting = captured.filter(
    (c) =>
      /rate|price|forex|quote|corridor|currency|exchange|inr|aed/i.test(c.url) &&
      !/google|facebook|adservices|cookielaw|onetrust|optimizely|quantummetric|adobe|mparticle|demdex/i.test(c.url),
  );
  log(`  total ${captured.length}, interesting ${interesting.length}`);
  for (const c of interesting) {
    log(`  [${c.status ?? '?'}] ${c.method} ${c.url.slice(0, 200)}`);
    if (c.body) log(`     body: ${c.body.slice(0, 200)}`);
    if (c.bodyPreview) log(`     resp: ${c.bodyPreview.slice(0, 200)}`);
  }

  await ctx.close();
}

// MASARIF: scroll, look for India link
await probe(
  { id: 'masarif', url: 'https://www.masarif.ae/', wait: 12000 },
  async (page) => {
    await page.waitForTimeout(3000);
    // try clicking India / INR if visible
    for (const sel of ['text=India', 'text=INR', 'a[href*="india"]', 'a[href*="INR"]']) {
      try {
        const el = await page.$(sel);
        if (el) { await el.click({ timeout: 2000 }); log(`  clicked: ${sel}`); break; }
      } catch {}
    }
    await page.waitForTimeout(4000);
    // scroll
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2000);
  },
);

// LULU: try interacting
await probe(
  { id: 'lulu', url: 'https://www.lulumoney.com/index.php?country=UAE#/', wait: 10000 },
  async (page) => {
    await page.waitForTimeout(5000);
    // scroll to trigger lazy loads
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2000);
  },
);

// CAREEM: navigate to send money
await probe(
  { id: 'careem', url: 'https://www.careempay.com/en-ae/send-money-to-india', wait: 10000 },
  async (page) => {
    await page.waitForTimeout(3000);
    // try the calculator if present
    for (const sel of ['input[type="number"]', '[data-testid*="amount"]', 'text=Calculate']) {
      try {
        const el = await page.$(sel);
        if (el) { await el.click(); break; }
      } catch {}
    }
  },
);

// REMITFINDER: corridor params — try the rates page directly
await probe(
  { id: 'rf', url: 'https://www.remitfinder.com/exchangeRates/usd-to-inr', wait: 12000 },
  async (page) => {
    // The rates page may fire a corridor-specific call after render
    await page.waitForTimeout(8000);
  },
);

// WESTERN UNION: type into the calculator to trigger a quote
await probe(
  { id: 'wu', url: 'https://www.westernunion.com/us/en/web/send-money/start', wait: 12000 },
  async (page) => {
    await page.waitForTimeout(5000);
    // Try to type into the send amount field; the page is heavy
    try {
      const amount = await page.$('input[type="text"], input[type="number"]');
      if (amount) { await amount.fill('1000'); }
    } catch {}
    await page.waitForTimeout(3000);
  },
);

await browser.close();
log('\nDone.');
