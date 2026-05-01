// Find the non-promo Remitly rate. Two strategies:
//  1) Search the static HTML for a second rate (with "standard" / "regular" /
//     "after first transfer" / "above 6000" qualifiers).
//  2) Open the page, fill the calculator with an amount > 6000, observe both
//     the rendered "they-receive" amount and any XHR fired.
import { chromium } from 'playwright';

const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';

// 1) Plain HTTP — find ALL rate-like patterns and surrounding context
async function plainHttp(url) {
  const r = await fetch(url, { headers: { 'User-Agent': ua } });
  const text = await r.text();
  // Find every "X INR to 1 USD" or "1 USD = X INR"
  const matches = [];
  for (const m of text.matchAll(/(\d{1,3}\.\d{2,6})\s*INR\s+to\s+1\s*(USD|AED)/gi)) {
    matches.push({ rate: m[1], ctx: text.slice(Math.max(0, m.index - 80), m.index + 150).replace(/\s+/g, ' ') });
  }
  for (const m of text.matchAll(/1\s*(USD|AED)\s*=\s*(\d{1,3}\.\d{2,6})\s*INR/gi)) {
    matches.push({ rate: m[2], ctx: text.slice(Math.max(0, m.index - 80), m.index + 150).replace(/\s+/g, ' ') });
  }
  // Search for 'standard' / 'regular' / 'first transfer' near rate language
  const standardCtx = text.match(/[^.]{0,200}\b(standard|regular|after first|above|over\s*\d|repeat|returning)\b[^.]{0,200}/gi);
  process.stdout.write(`\n[${url}] status=${r.status}\n`);
  process.stdout.write(`  unique rates found: ${[...new Set(matches.map(m => m.rate))].join(', ')}\n`);
  process.stdout.write(`  match contexts (up to 5):\n`);
  for (const m of matches.slice(0, 5)) process.stdout.write(`    @${m.rate}: ${m.ctx.slice(0, 200)}\n`);
  process.stdout.write(`  'standard'/'regular' contexts:\n`);
  for (const c of (standardCtx ?? []).slice(0, 5)) process.stdout.write(`    ${c.slice(0, 200)}\n`);
}

await plainHttp('https://www.remitly.com/us/en/currency-converter/usd-to-inr-rate');
await plainHttp('https://www.remitly.com/ae/en/currency-converter/aed-to-inr-rate');

// 2) Playwright with high amount to see if calculator switches rates
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ userAgent: ua, viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

const captured = [];
page.on('request', (req) => {
  if (req.resourceType() === 'xhr' || req.resourceType() === 'fetch') {
    let body = null; try { body = req.postData(); } catch {}
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
    const idx = captured.findIndex(e => e.url === req.url() && e.method === req.method() && !e.status);
    if (idx >= 0) {
      captured[idx].status = res.status();
      captured[idx].bodyPreview = t.slice(0, 600);
    }
  } catch {}
});

await page.goto('https://www.remitly.com/us/en/currency-converter/usd-to-inr-rate', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(4000);

// Snapshot rendered text BEFORE any input
const before = await page.evaluate(() => {
  const txt = document.body.innerText.replace(/\s+/g, ' ');
  const all = [...txt.matchAll(/(\d{1,3}\.\d{2,6})\s*INR/g)].map(m => m[1]);
  return { rates: [...new Set(all)], sendInput: (document.querySelector('input[id*="you-send"]'))?.value, recvInput: (document.querySelector('input[id*="they-receive"]'))?.value };
});
process.stdout.write(`\n[Playwright, before input] rates=${JSON.stringify(before.rates)}, send=${before.sendInput}, recv=${before.recvInput}\n`);

// Fill a value above the promo cap (10000 USD)
const sendInput = await page.$('input[id*="you-send"]');
if (sendInput) {
  await sendInput.fill('10000');
  await page.waitForTimeout(4000);
  const after = await page.evaluate(() => {
    const txt = document.body.innerText.replace(/\s+/g, ' ');
    const all = [...txt.matchAll(/(\d{1,3}\.\d{2,6})\s*INR/g)].map(m => m[1]);
    const recv = document.querySelector('input[id*="they-receive"]')?.value;
    const ctx = txt.slice(0, 500);
    return { rates: [...new Set(all)], recvInput: recv, ctx };
  });
  process.stdout.write(`[Playwright, after sending=10000] rates=${JSON.stringify(after.rates)}, recv=${after.recvInput}\n`);
  process.stdout.write(`  rendered text excerpt: ${after.ctx.slice(0, 300)}\n`);
}

// Filter captured for rate/quote XHRs
const rateRelated = captured.filter(c => /rate|quote|forex|conversion|estimate|calculator|fees|pricing/i.test(c.url) && !/google|adsrvr|insight|nr-data|cookielaw|onetrust|optimizely|amplitude|segment|sentry|datadog|adobe|mparticle|demdex|linkedin|taboola|bugsnag|prodregistry|amazon-adsystem|paa-reporting|appsflyer|onelink|branch|tod8mp|reddit/i.test(c.url));
process.stdout.write(`\n[XHRs that look rate-related: ${rateRelated.length}]\n`);
for (const c of rateRelated) {
  process.stdout.write(`[${c.status ?? '?'}] ${c.method} ${c.url}\n`);
  if (c.body) process.stdout.write(`  body: ${c.body.slice(0, 300)}\n`);
  if (c.bodyPreview) process.stdout.write(`  resp: ${c.bodyPreview.slice(0, 400)}\n`);
}

await browser.close();
