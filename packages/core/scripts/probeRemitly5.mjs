// Drive the Remitly calculator with > $6000 to see the non-promo rate.
// Uses keyboard.type which more reliably triggers React onChange handlers.
import { chromium } from 'playwright';

const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const browser = await chromium.launch({ headless: true });

async function probe(url, sendAmount) {
  const ctx = await browser.newContext({ userAgent: ua, viewport: { width: 1280, height: 900 }, locale: 'en-US' });
  const page = await ctx.newPage();
  process.stdout.write(`\n=== ${url}, send=${sendAmount} ===\n`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);

  // Triple-click to select existing input value, then type fresh
  const sendInput = await page.$('input[id*="you-send"]');
  if (sendInput) {
    await sendInput.click({ clickCount: 3 });
    await page.keyboard.type(String(sendAmount), { delay: 30 });
    await page.waitForTimeout(3500);

    // Read every rate-shaped number AND its surrounding labeled context
    const result = await page.evaluate(() => {
      const txt = document.body.innerText.replace(/\s+/g, ' ');
      const rates = [...txt.matchAll(/(\d{1,3}\.\d{2,6})\s*INR/g)].map(m => m[1]);

      // Look for elements that PAIR a rate with a label like "promo"/"standard"/"non-promo"
      const labeled = [];
      const all = Array.from(document.querySelectorAll('div, span, p, h1, h2, h3, h4'));
      for (const el of all) {
        const t = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (!t || t.length > 200) continue;
        if (/(special|promo|standard|non-promo|after first|over\s*\d)/i.test(t) && /\d{1,3}\.\d{2,6}/.test(t)) {
          labeled.push(t.slice(0, 200));
        }
      }
      const labeledUnique = [...new Set(labeled)];

      const recvInput = document.querySelector('input[id*="they-receive"]');
      const sendVal = (document.querySelector('input[id*="you-send"]'))?.value;
      return {
        sendVal,
        recvVal: recvInput?.value,
        rates: [...new Set(rates)],
        labeled: labeledUnique.slice(0, 8),
      };
    });
    process.stdout.write(`  send="${result.sendVal}", recv="${result.recvVal}"\n`);
    process.stdout.write(`  unique rates: ${result.rates.join(', ')}\n`);
    process.stdout.write(`  labeled rate contexts:\n`);
    for (const l of result.labeled) process.stdout.write(`    - ${l}\n`);
  } else {
    process.stdout.write(`  no input found\n`);
  }
  await ctx.close();
}

await probe('https://www.remitly.com/us/en/currency-converter/usd-to-inr-rate', '10000');
await probe('https://www.remitly.com/ae/en/currency-converter/aed-to-inr-rate', '50000');

await browser.close();
