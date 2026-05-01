// Server received send_amount but converted to 0 — try alternate field names.
const variants = [
  { base_currency: 'AED', quote_currency: 'INR', sender_amount: 5000 },
  { base_currency: 'AED', quote_currency: 'INR', amount: 5000 },
  { base_currency: 'AED', quote_currency: 'INR', sendAmount: 5000 },
  { base_currency: 'AED', quote_currency: 'INR', send_amount: '5000' },
  { base_currency: 'AED', quote_currency: 'INR', send_amount: 5000.0 },
  { base_currency: 'AED', quote_currency: 'INR', send_amount: { value: 5000 } },
  // Maybe the captured body had it under "data" or "request"
  { request: { base_currency: 'AED', quote_currency: 'INR', send_amount: 5000 } },
];

for (const body of variants) {
  const r = await fetch('https://api-z1.aspora.com/appserver/public-forex-provider/get-rates', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5)',
      Origin: 'https://aspora.com',
      Referer: 'https://aspora.com/',
    },
    body: JSON.stringify(body),
  });
  const txt = await r.text();
  process.stdout.write(`[${r.status}] ${JSON.stringify(body)} -> ${txt.slice(0, 200)}\n`);
}
