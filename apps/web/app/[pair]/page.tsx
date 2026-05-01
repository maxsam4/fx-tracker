import { notFound } from 'next/navigation';
import { parsePairKey } from '@fx/core/config';
import { loadProvidersConfig } from '@fx/core/config';
import {
  getPairId,
  getMidMarketSeries,
  getReferenceSeries,
  getLatestMid,
  getLatestProviderTable,
} from '@/lib/queries';
import { Dashboard } from '@/components/Dashboard';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function PairPage({
  params,
  searchParams,
}: {
  params: { pair: string };
  searchParams: { window?: string; amount?: string };
}) {
  const pairKey = decodeURIComponent(params.pair).toUpperCase();
  let pair;
  try {
    pair = parsePairKey(pairKey);
  } catch {
    notFound();
  }

  const config = loadProvidersConfig();
  const pairCfg = config.pairs[pairKey];
  if (!pairCfg) notFound();

  const sendAmount = pickAmount(searchParams.amount, pairCfg.referenceAmounts);
  const windowMs = pickWindow(searchParams.window);

  const pairId = await getPairId(pair);
  if (!pairId) {
    return (
      <div className="rounded-md border border-edge bg-surface p-6 text-muted">
        No data yet for <span className="text-text">{pairKey}</span>. The first poll will run
        within an hour of starting the worker.
      </div>
    );
  }

  const [mid, midSeries, refSeries, table] = await Promise.all([
    getLatestMid(pairId),
    getMidMarketSeries(pairId, windowMs),
    getReferenceSeries(pairId, windowMs),
    getLatestProviderTable(pairId, sendAmount),
  ]);

  return (
    <Dashboard
      pairKey={pairKey}
      pair={pair}
      sendAmount={sendAmount}
      referenceAmounts={pairCfg.referenceAmounts}
      windowMs={windowMs}
      mid={mid}
      midSeries={midSeries}
      refSeries={refSeries}
      table={table}
    />
  );
}

function pickAmount(input: string | undefined, available: number[]): number {
  if (input) {
    const n = parseFloat(input);
    if (Number.isFinite(n) && available.includes(n)) return n;
  }
  return available[Math.floor(available.length / 2)] ?? available[0]!;
}

function pickWindow(input: string | undefined): number {
  const map: Record<string, number> = {
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
    '90d': 90 * 24 * 60 * 60 * 1000,
    '1y': 365 * 24 * 60 * 60 * 1000,
    all: 10 * 365 * 24 * 60 * 60 * 1000,
  };
  return map[input ?? '7d'] ?? map['7d']!;
}
