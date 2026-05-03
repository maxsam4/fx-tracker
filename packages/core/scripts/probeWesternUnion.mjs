// Probe Western Union to find a rate API. Tries:
//  1. Public converter page with full network capture (rate may load via XHR).
//  2. Send-money calculator with corridor interaction (US-IN, AE-IN).
//
// Usage:  node scripts/probeWesternUnion.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const OUT_DIR = path.join(process.cwd(), '.discovery');
fs.mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  viewport: { width: 1280, height: 900 },
  locale: 'en-US',
});

async function probe(label, url, interact) {
  const page = await ctx.newPage();
  const captured = [];

  page.on('request', (req) => {
    const t = req.resourceType();
    if (t === 'xhr' || t === 'fetch') {
      captured.push({ method: req.method(), url: req.url(), type: t, postData: req.postData() ?? null });
    }
  });

  page.on('response', async (res) => {
    const req = res.request();
    const t = req.resourceType();
    if (t !== 'xhr' && t !== 'fetch') return;
    const ct = res.headers()['content-type'] ?? '';
    let body = '';
    try {
      if (ct.includes('json') || ct.includes('text')) {
        const txt = await res.text();
        body = txt.length > 2500 ? txt.slice(0, 2500) + '... [truncated]' : txt;
      }
    } catch {}
    const idx = captured.findIndex(
      (e) => e.url === req.url() && e.method === req.method() && e.status === undefined,
    );
    if (idx >= 0) {
      captured[idx].status = res.status();
      captured[idx].contentType = ct;
      captured[idx].body = body;
    }
  });

  console.log(`\n=== ${label} :: ${url} ===`);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForTimeout(4000);
    if (interact) {
      try {
        await interact(page);
      } catch (err) {
        console.log(`  interact error: ${err.message}`);
      }
    }
    await page.waitForTimeout(4000);
  } catch (err) {
    console.log(`  navigation error: ${err.message}`);
  }

  const interesting = captured.filter((c) => {
    const u = c.url;
    if (/quantummetric|optimizely|amplitude|mparticle|demdex|onetrust|cookielaw|smetrics|adobedtm|go-mpulse|akam/i.test(u)) return false;
    if (/\/O3xEtzD72\//.test(u)) return false;
    return true;
  });

  console.log(`  captured ${captured.length} XHR/fetch (${interesting.length} interesting)`);
  for (const c of interesting) {
    console.log(`  [${c.status ?? '?'}] ${c.method} ${c.url}`);
    if (c.postData) console.log(`    POST: ${c.postData.slice(0, 200)}`);
    if (c.body) console.log(`    BODY: ${c.body.slice(0, 300)}`);
  }

  fs.writeFileSync(path.join(OUT_DIR, `${label}.json`), JSON.stringify(captured, null, 2));
  try {
    fs.writeFileSync(path.join(OUT_DIR, `${label}.html`), await page.content());
  } catch {}
  await page.close();
}

// 1) Public USD-INR converter page (no interaction needed if rate loads on render)
await probe('wu-converter-usd-inr', 'https://www.westernunion.com/us/en/currency-converter/usd-to-inr-rate.html', async (page) => {});

// 2) Public AED-INR converter (UAE site)
await probe('wu-converter-aed-inr', 'https://www.westernunion.com/ae/en/currency-converter/aed-to-inr-rate.html', async (page) => {});

// 3) Send-money start page with corridor selection (US -> India)
await probe('wu-send-us-in', 'https://www.westernunion.com/us/en/web/send-money/start', async (page) => {
  // Try to set destination country to India.
  // Common patterns: a search input or dropdown with name/aria-label "destination" or "country".
  const candidates = [
    'input[aria-label*="destination" i]',
    'input[placeholder*="country" i]',
    'input[name*="country" i]',
    'input[id*="country" i]',
    'input[id*="destination" i]',
    '[data-testid*="country"] input',
    '[data-testid*="destination"] input',
  ];
  for (const sel of candidates) {
    const el = await page.$(sel);
    if (el) {
      console.log(`  found country input: ${sel}`);
      await el.click();
      await el.fill('India');
      await page.waitForTimeout(800);
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2000);
      break;
    }
  }
  // Try amount input
  const amountSelectors = [
    'input[id*="send" i][type="text"], input[id*="send" i][type="number"]',
    'input[name*="send" i]',
    'input[aria-label*="amount" i]',
  ];
  for (const sel of amountSelectors) {
    const el = await page.$(sel);
    if (el) {
      console.log(`  found amount input: ${sel}`);
      await el.click();
      await el.fill('1000');
      await page.waitForTimeout(2000);
      break;
    }
  }
  // Body text dump for any rate text
  const text = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  const m = text.match(/1\s*USD\s*=?\s*[0-9.,]+\s*INR/i);
  if (m) console.log(`  body text rate: ${m[0]}`);
});

// 4) Send-money start page UAE -> India
await probe('wu-send-ae-in', 'https://www.westernunion.com/ae/en/web/send-money/start', async (page) => {
  const candidates = [
    'input[aria-label*="destination" i]',
    'input[placeholder*="country" i]',
    'input[name*="country" i]',
    'input[id*="country" i]',
    'input[id*="destination" i]',
  ];
  for (const sel of candidates) {
    const el = await page.$(sel);
    if (el) {
      await el.click();
      await el.fill('India');
      await page.waitForTimeout(800);
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2000);
      break;
    }
  }
  const text = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  const m = text.match(/1\s*AED\s*=?\s*[0-9.,]+\s*INR/i);
  if (m) console.log(`  body text rate: ${m[0]}`);
});

await ctx.close();
await browser.close();
console.log('\nDone.');
