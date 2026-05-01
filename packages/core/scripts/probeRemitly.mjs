// Discover Remitly's direct API by capturing XHR while interacting with their
// public quote calculator.
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });

async function probe(url, interact) {
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
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
    if (!ct.includes('json')) return;
    try {
      const t = await res.text();
      const idx = captured.findIndex((e) => e.url === req.url() && e.method === req.method() && !e.status);
      if (idx >= 0) {
        captured[idx].status = res.status();
        captured[idx].bodyPreview = t.length > 1500 ? t.slice(0, 1500) + '...' : t;
      }
    } catch {}
  });

  process.stdout.write(`\n=== ${url} ===\n`);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);
    if (interact) await interact(page);
    await page.waitForTimeout(8000);
  } catch (e) {
    process.stdout.write(`  navigation error: ${e.message}\n`);
  }

  // Filter to obvious rate / quote / pricing endpoints
  const interesting = captured.filter(
    (c) =>
      /rate|quote|price|forex|pricing|conversion|calculator|estimate|fees/i.test(c.url) &&
      !/google|facebook|adservices|cookielaw|onetrust|optimizely|quantummetric|adobe|mparticle|demdex|amplitude|segment|sentry|datadog/i.test(c.url),
  );
  process.stdout.write(`  captured ${captured.length}, interesting ${interesting.length}\n`);
  for (const c of interesting) {
    process.stdout.write(`  [${c.status ?? '?'}] ${c.method} ${c.url.slice(0, 200)}\n`);
    if (c.body) process.stdout.write(`     body: ${c.body.slice(0, 300)}\n`);
    if (c.bodyPreview) process.stdout.write(`     resp: ${c.bodyPreview.slice(0, 400)}\n`);
  }

  await ctx.close();
}

// 1. Public homepage with calculator
await probe('https://www.remitly.com/us/en/india', async (page) => {
  // Try to find the calculator and type
  const inputs = await page.$$('input[type="text"], input[type="number"], input[inputmode="numeric"], input[inputmode="decimal"]');
  if (inputs.length > 0) {
    try { await inputs[0].fill('1000'); } catch {}
  }
});

// 2. Different country source (UAE → India)
await probe('https://www.remitly.com/ae/en/india', async (page) => {
  const inputs = await page.$$('input[type="text"], input[type="number"], input[inputmode="numeric"], input[inputmode="decimal"]');
  if (inputs.length > 0) {
    try { await inputs[0].fill('5000'); } catch {}
  }
});

// 3. Pricing page
await probe('https://www.remitly.com/us/en/india/pricing', null);

await browser.close();
process.stdout.write('\nDone.\n');
