import Link from 'next/link';
import { notFound } from 'next/navigation';
import { parsePairKey, loadProvidersConfig } from '@fx/core/config';
import {
  getPairId,
  getProviderSeries,
  getMidMarketSeries,
  getLatestMid,
} from '@/lib/queries';
import { ProviderHistoryChart } from '@/components/ProviderHistoryChart';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const WINDOW_MS: Record<string, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '90d': 90 * 24 * 60 * 60 * 1000,
  '1y': 365 * 24 * 60 * 60 * 1000,
  all: 10 * 365 * 24 * 60 * 60 * 1000,
};

export default async function ProviderPage({
  params,
  searchParams,
}: {
  params: { pair: string; providerId: string };
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

  const providerId = decodeURIComponent(params.providerId);
  const sendAmount = pickAmount(searchParams.amount, pairCfg.referenceAmounts);
  const windowMs = WINDOW_MS[searchParams.window ?? '30d'] ?? WINDOW_MS['30d']!;

  const pairId = await getPairId(pair);
  if (!pairId) {
    return (
      <div className="rounded-md border border-edge bg-surface p-6 text-muted">
        No data yet for {pairKey}.
      </div>
    );
  }

  const [series, midSeries, mid] = await Promise.all([
    getProviderSeries(pairId, sendAmount, windowMs),
    getMidMarketSeries(pairId, windowMs),
    getLatestMid(pairId),
  ]);

  const providerSeries = series.filter((s) => s.providerId === providerId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            href={`/${pairKey}?amount=${sendAmount}`}
            className="text-sm text-muted hover:text-text"
          >
            ← {pairKey}
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {providerId}{' '}
            <span className="text-muted">
              · {pair.from}→{pair.to}
            </span>
          </h1>
          <div className="mt-1 text-sm text-muted">
            Sending {sendAmount} {pair.from}
            {mid && (
              <span className="ml-2">
                · mid-market <span className="font-mono text-text">{mid.rate.toFixed(4)}</span>
              </span>
            )}
          </div>
        </div>
        <WindowLinks pairKey={pairKey} providerId={providerId} sendAmount={sendAmount} active={searchParams.window ?? '30d'} />
      </div>

      <section className="rounded-md border border-edge bg-surface p-4">
        <h2 className="mb-3 text-sm font-medium text-muted">Effective rate vs mid-market</h2>
        {providerSeries.length === 0 ? (
          <div className="py-8 text-center text-muted">
            No history captured yet for {providerId} at this amount.
          </div>
        ) : (
          <ProviderHistoryChart
            providerSeries={providerSeries.map((s) => ({
              t: s.t,
              rate: s.effectiveRate ?? s.receiveAmount / s.sendAmount,
              rawRate: s.receiveAmount / s.sendAmount,
            }))}
            midSeries={midSeries.map((m) => ({ t: m.t, rate: m.rate }))}
            providerLabel={providerId}
          />
        )}
      </section>

      <section className="rounded-md border border-edge bg-surface p-4">
        <h2 className="mb-3 text-sm font-medium text-muted">Recent quotes</h2>
        <RecentTable rows={providerSeries.slice(-50).reverse()} from={pair.from} to={pair.to} />
      </section>
    </div>
  );
}

function pickAmount(input: string | undefined, available: number[]): number {
  if (input) {
    const n = parseFloat(input);
    if (Number.isFinite(n) && available.includes(n)) return n;
  }
  return available[Math.floor(available.length / 2)] ?? available[0]!;
}

function WindowLinks({
  pairKey,
  providerId,
  sendAmount,
  active,
}: {
  pairKey: string;
  providerId: string;
  sendAmount: number;
  active: string;
}) {
  const opts = ['24h', '7d', '30d', '90d', '1y', 'all'];
  return (
    <div className="flex gap-1 rounded-md border border-edge bg-surface p-1">
      {opts.map((k) => (
        <Link
          key={k}
          href={`/${pairKey}/providers/${encodeURIComponent(providerId)}?window=${k}&amount=${sendAmount}`}
          className={`rounded px-2 py-1 text-xs ${
            k === active ? 'bg-edge text-text' : 'text-muted hover:text-text'
          }`}
        >
          {k}
        </Link>
      ))}
    </div>
  );
}

function RecentTable({
  rows,
  from,
  to,
}: {
  rows: Array<{ t: string; effectiveRate: number | null; receiveAmount: number; sendAmount: number; feeAmount: number }>;
  from: string;
  to: string;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-muted">
          <tr>
            <th className="px-2 py-2">When</th>
            <th className="px-2 py-2">Effective rate</th>
            <th className="px-2 py-2">Receive ({to})</th>
            <th className="px-2 py-2">Fee ({from})</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.t}>
              <td className="px-2 py-2 text-muted">{new Date(r.t).toLocaleString()}</td>
              <td className="px-2 py-2 font-mono">
                {r.effectiveRate ? r.effectiveRate.toFixed(4) : (r.receiveAmount / r.sendAmount).toFixed(4)}
              </td>
              <td className="px-2 py-2 font-mono">
                {r.receiveAmount.toLocaleString('en-US', { maximumFractionDigits: 2 })}
              </td>
              <td className="px-2 py-2 font-mono">
                {r.feeAmount.toLocaleString('en-US', { maximumFractionDigits: 2 })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
