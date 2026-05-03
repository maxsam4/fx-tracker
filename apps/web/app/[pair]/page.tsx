import { notFound } from 'next/navigation';
import { parsePairKey } from '@fx/core/config';
import { loadProvidersConfig } from '@fx/core/config';
import {
  getPairId,
  getMidMarketSeries,
  getReferenceSeries,
  getLatestMid,
  getLatestProviderTable,
  getLatestReferenceRates,
  getLatestProviderRunStatus,
} from '@/lib/queries';
import { Dashboard } from '@/components/Dashboard';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function PairPage({
  params,
  searchParams,
}: {
  params: { pair: string };
  searchParams: { window?: string };
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

  const sendAmount = pairCfg.referenceAmounts[0]!;
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

  const [mid, midSeries, refSeries, table, refLatest, runStatus] = await Promise.all([
    getLatestMid(pairId),
    getMidMarketSeries(pairId, windowMs),
    getReferenceSeries(pairId, windowMs),
    getLatestProviderTable(pairId, sendAmount),
    getLatestReferenceRates(pairId),
    getLatestProviderRunStatus(pairId),
  ]);

  return (
    <Dashboard
      pairKey={pairKey}
      pair={pair}
      sendAmount={sendAmount}
      configuredProviders={pairCfg.providers}
      windowMs={windowMs}
      mid={mid}
      midSeries={midSeries}
      refSeries={refSeries}
      table={table}
      refLatest={refLatest}
      runStatus={runStatus}
    />
  );
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
