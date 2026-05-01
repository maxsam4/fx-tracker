import { remitlyProvider } from '../src/providers/remitly.js';
import { shutdownBrowser } from '../src/scrape/browserPool.js';

async function main() {
  for (const pair of [{ from: 'USD', to: 'INR' } as const, { from: 'AED', to: 'INR' } as const]) {
    const amount = pair.from === 'USD' ? 1000 : 5000;
    try {
      const q = await remitlyProvider.fetchQuote({ pair, sendAmount: amount });
      const s = Array.isArray(q) ? q[0]! : q;
      console.log(`${pair.from}-${pair.to}: rate=${s.rate}, dataSource=${s.dataSource}, fee=${s.feeAmount}`);
    } catch (e) {
      console.log(`${pair.from}-${pair.to}: ERROR ${(e as Error).message}`);
    }
  }
  await shutdownBrowser();
}

main();
