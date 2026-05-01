// Look at Remitly's full XHR list (filter out only obvious noise) and look
// at the currency-converter page where the calculator should be.
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
      captured[idx].bodyPreview = t.slice(0, 600);
    }
  } catch {}
});

const URL = 'https://www.remitly.com/us/en/currency-converter/usd-to-inr-rate';
process.stdout.write(`=== ${URL} ===\n`);
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(5000);

// Try to find and interact with the calculator
const inputs = await page.$$('input');
process.stdout.write(`inputs found: ${inputs.length}\n`);
for (let i = 0; i < Math.min(inputs.length, 5); i++) {
  const el = inputs[i];
  try {
    const attrs = await el.evaluate(e => ({
      type: e.type, name: e.name, id: e.id, placeholder: e.placeholder, inputmode: e.getAttribute('inputmode'),
    }));
    process.stdout.write(`  input[${i}]: ${JSON.stringify(attrs)}\n`);
  } catch {}
}

// Try to type in the first numeric input
for (const el of inputs) {
  const im = await el.evaluate(e => e.type === 'number' || e.getAttribute('inputmode') === 'numeric' || e.getAttribute('inputmode') === 'decimal');
  if (im) {
    try { await el.fill('1500'); process.stdout.write(`  filled 1500\n`); break; } catch {}
  }
}
await page.waitForTimeout(6000);

// Print every JSON XHR captured (filter only known tracking)
const NOISE = /google|doubleclick|adsrvr|nr-data|cookielaw|onetrust|optimizely|quantummetric|adobe|mparticle|demdex|amplitude|segment|sentry|datadog|linkedin|taboola|bugsnag|prodregistryv2|braze|paypal/i;
const interesting = captured.filter(c => !NOISE.test(c.url));
process.stdout.write(`\nfull capture: ${captured.length}, non-tracking: ${interesting.length}\n`);
for (const c of interesting) {
  process.stdout.write(`[${c.status ?? '?'}] ${c.method} ${c.url.slice(0, 200)}\n`);
  if (c.body) process.stdout.write(`   body: ${c.body.slice(0, 400)}\n`);
  if (c.bodyPreview) process.stdout.write(`   resp: ${c.bodyPreview.slice(0, 600)}\n`);
}

// Also extract the rate visible in the rendered DOM
const rendered = await page.evaluate(() => {
  const text = document.body.innerText.replace(/\s+/g, ' ').slice(0, 600);
  // Look for rate-shaped numbers near "INR"
  const matches = [];
  const all = Array.from(document.querySelectorAll('*'));
  for (const el of all) {
    const t = (el.textContent ?? '').trim();
    if (!t || t.length > 200) continue;
    const m = t.match(/(\d{1,3}\.\d{2,6})\s*INR/i);
    if (m) matches.push({ tag: el.tagName.toLowerCase(), txt: t.slice(0, 100) });
    if (matches.length >= 5) break;
  }
  return { text, matches };
});
process.stdout.write(`\nrendered text excerpt:\n${rendered.text}\n`);
process.stdout.write(`\nINR-mentioned elements:\n`);
for (const m of rendered.matches) process.stdout.write(`  <${m.tag}>: ${m.txt}\n`);

await browser.close();
