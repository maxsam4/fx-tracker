// Find the non-promo rate context in Remitly's HTML.
const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';

async function fetchPage(url) {
  const r = await fetch(url, { headers: { 'User-Agent': ua } });
  return await r.text();
}

const html = await fetchPage('https://www.remitly.com/us/en/currency-converter/usd-to-inr-rate');

// Search context around "If you are sending over"
const overIdx = html.indexOf('If you are sending over');
if (overIdx > 0) {
  process.stdout.write(`"If you are sending over" context:\n`);
  process.stdout.write(html.slice(overIdx, overIdx + 800).replace(/\s+/g, ' ') + '\n\n');
}

// Search for "after first" / "regular" / "standard rate"
for (const kw of ['after first', 'standard rate', 'regular rate', 'regular FX', 'standard FX', 'normal rate']) {
  const idx = html.toLowerCase().indexOf(kw);
  if (idx > 0) {
    process.stdout.write(`"${kw}" context:\n`);
    process.stdout.write(html.slice(idx, idx + 400).replace(/\s+/g, ' ') + '\n\n');
  }
}

// Look for "FX rate" mentions and surrounding text
let i = -1;
let count = 0;
while ((i = html.indexOf('FX rate', i + 1)) >= 0 && count < 6) {
  process.stdout.write(`"FX rate" context [${count}]:\n`);
  process.stdout.write(html.slice(Math.max(0, i - 200), i + 200).replace(/\s+/g, ' ') + '\n\n');
  count++;
}

// Find "promoRate" / "exchangeRate" / "fxRate" in JSON blobs
const jsonish = [...html.matchAll(/"(promo|standard|regular|fx|exchange|customer)Rate[A-Za-z]*"\s*:\s*([0-9.]+|"[^"]+")/g)];
process.stdout.write(`JSON-like rate fields:\n`);
for (const m of jsonish.slice(0, 10)) process.stdout.write(`  ${m[0]}\n`);

// Try to find the embedded Next.js __NEXT_DATA__ or props
const nextData = html.match(/<script id="__NEXT_DATA__"[^>]*>([^<]+)<\/script>/);
if (nextData) {
  try {
    const data = JSON.parse(nextData[1]);
    // Walk and print all keys named *rate*
    const found = [];
    function walk(obj, path) {
      if (!obj || typeof obj !== 'object') return;
      for (const [k, v] of Object.entries(obj)) {
        const np = path + '.' + k;
        if (/rate/i.test(k) && (typeof v === 'number' || typeof v === 'string')) {
          found.push(`${np} = ${JSON.stringify(v).slice(0, 80)}`);
        }
        if (typeof v === 'object') walk(v, np);
        if (found.length > 20) return;
      }
    }
    walk(data, '$');
    process.stdout.write(`\n__NEXT_DATA__ rate-named keys:\n`);
    for (const f of found) process.stdout.write(`  ${f}\n`);
  } catch (e) {
    process.stdout.write(`__NEXT_DATA__ parse error: ${e.message}\n`);
  }
} else {
  process.stdout.write(`No __NEXT_DATA__ block.\n`);
}

// Also check for state hydration in script tags
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
process.stdout.write(`total script tags: ${scripts.length}\n`);
const ratey = scripts.filter(s => /rate.{0,20}\d{2}\.\d{2}/i.test(s[1]));
process.stdout.write(`scripts containing rate-shaped numbers: ${ratey.length}\n`);
for (const s of ratey.slice(0, 3)) {
  // Find rate-shaped numbers inside
  const matches = [...s[1].matchAll(/(\d{2}\.\d{2,4})/g)].slice(0, 8).map(m => m[1]);
  process.stdout.write(`  rates in script: ${matches.join(', ')}\n`);
}
