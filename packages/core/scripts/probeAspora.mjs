// Aspora has a rich quote endpoint. Probe the body shape so we can call it
// directly from the plugin.

const variants = [
  { source_currency: 'AED', quote_currency: 'INR', send_amount: 5000 },
  { sourceCurrency: 'AED', targetCurrency: 'INR', sendAmount: 5000 },
  { from: 'AED', to: 'INR', amount: 5000 },
  { base_currency: 'AED', quote_currency: 'INR', send_amount: 5000 },
];

for (const body of variants) {
  console.log('--- body:', JSON.stringify(body));
  const r = await fetch('https://api-z1.aspora.com/appserver/public-forex-provider/get-rates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'fx-tracker/0.1' },
    body: JSON.stringify(body),
  });
  console.log(`status ${r.status}`);
  const txt = await r.text();
  console.log(txt.slice(0, 600));
  console.log();
}

console.log('=== forex/rates GET (no body) ===');
const g = await fetch('https://api-z1.aspora.com/forex/rates', {
  headers: { 'User-Agent': 'fx-tracker/0.1' },
});
console.log('status:', g.status, '\nbody:', await g.text());

// Probe USD send
console.log('\n=== USD send body ===');
const u = await fetch('https://api-z1.aspora.com/appserver/public-forex-provider/get-rates', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'User-Agent': 'fx-tracker/0.1' },
  body: JSON.stringify({ base_currency: 'USD', quote_currency: 'INR', send_amount: 1000 }),
});
console.log('status:', u.status, '\nbody:', (await u.text()).slice(0, 1500));
