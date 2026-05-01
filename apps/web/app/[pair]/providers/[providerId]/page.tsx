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
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';
import { Stat, DeltaBadge } from '@/components/ui/Stat';

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

const WINDOW_KEYS = ['24h', '7d', '30d', '90d', '1y', 'all'] as const;

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
  const activeWindow = searchParams.window ?? '30d';
  const windowMs = WINDOW_MS[activeWindow] ?? WINDOW_MS['30d']!;

  const pairId = await getPairId(pair);
  if (!pairId) {
    return (
      <div className="rounded-md border border-edge bg-surface px-6 py-12 text-center text-muted">
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
  const latest = providerSeries[providerSeries.length - 1] ?? null;
  const latestRate = latest?.effectiveRate ?? (latest ? latest.receiveAmount / latest.sendAmount : null);
  const deltaVsMid =
    latestRate !== null && mid ? ((latestRate - mid.rate) / mid.rate) * 100 : null;

  return (
    <div className="stagger space-y-8">
      {/* HEADER */}
      <section className="relative overflow-hidden rounded-md border border-edge bg-surface">
        <div className="pointer-events-none absolute inset-0 hero-glow" aria-hidden />
        <div className="relative grid gap-8 px-6 py-8 md:grid-cols-[1.4fr_1fr] md:px-8 md:py-10">
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={`/${pairKey}?amount=${sendAmount}`}
                className="text-2xs uppercase tracking-[0.16em] text-subtle hover:text-text"
              >
                ← {pairKey}
              </Link>
              <span className="text-subtle">/</span>
              <span className="text-2xs uppercase tracking-[0.16em] text-muted">
                provider
              </span>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <h1 className="font-mono text-3xl font-medium tracking-tight text-text">
                {providerId}
              </h1>
              <Pill tone="muted" mono>
                {pair.from} → {pair.to}
              </Pill>
            </div>
            <Stat
              label={`Latest effective rate · ${sendAmount} ${pair.from}`}
              value={latestRate !== null ? latestRate.toFixed(4) : '—'}
              unit={`${pair.to} per ${pair.from}`}
              delta={deltaVsMid !== null ? { value: deltaVsMid, label: 'vs mid' } : null}
              size="md"
            />
          </div>

          <aside className="grid content-end gap-3">
            {mid && (
              <Tile
                label="Mid-market reference"
                value={mid.rate.toFixed(4)}
                hint={`captured ${timeAgo(mid.capturedAt)}`}
              />
            )}
            {latest && (
              <Tile
                label={`Receive (${pair.to})`}
                value={latest.receiveAmount.toLocaleString('en-US', {
                  maximumFractionDigits: 2,
                })}
                hint={`fee ${latest.feeAmount?.toFixed(2) ?? '0.00'} ${pair.from}`}
              />
            )}
          </aside>
        </div>
      </section>

      {/* WINDOW CONTROLS */}
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-2xs uppercase tracking-[0.16em] text-subtle">
          History window
        </div>
        <div className="inline-flex rounded-md border border-edge bg-surface p-0.5">
          {WINDOW_KEYS.map((k) => (
            <Link
              key={k}
              href={`/${pairKey}/providers/${encodeURIComponent(providerId)}?window=${k}&amount=${sendAmount}`}
              className={`tabular rounded px-2.5 py-1 font-mono text-xs font-medium transition-colors ${
                k === activeWindow
                  ? 'bg-elevated text-text shadow-ring'
                  : 'text-muted hover:text-text'
              }`}
            >
              {k}
            </Link>
          ))}
        </div>
      </section>

      {/* CHART */}
      <Card>
        <CardHeader
          title="Effective rate vs mid-market"
          subtitle={`${providerId} after advertised fees`}
        />
        <CardBody className="px-2 pb-3 pt-1">
          {providerSeries.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted">
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
        </CardBody>
      </Card>

      {/* RECENT QUOTES */}
      <Card>
        <CardHeader
          title="Recent quotes"
          subtitle="captured at hourly polls"
          right={
            <span className="text-2xs uppercase tracking-[0.14em] text-subtle">
              {Math.min(providerSeries.length, 50)} shown
            </span>
          }
        />
        <RecentTable
          rows={providerSeries.slice(-50).reverse()}
          from={pair.from}
          to={pair.to}
          midRate={mid?.rate ?? null}
        />
      </Card>
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

function Tile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded border border-edge bg-bg/40 px-4 py-3">
      <div className="text-2xs uppercase tracking-[0.14em] text-subtle">{label}</div>
      <div className="tabular mt-1.5 font-mono text-lg font-medium text-text">{value}</div>
      {hint && <div className="mt-1 text-2xs uppercase tracking-[0.14em] text-muted">{hint}</div>}
    </div>
  );
}

function RecentTable({
  rows,
  from,
  to,
  midRate,
}: {
  rows: Array<{
    t: string;
    effectiveRate: number | null;
    receiveAmount: number;
    sendAmount: number;
    feeAmount: number;
  }>;
  from: string;
  to: string;
  midRate: number | null;
}) {
  if (rows.length === 0) {
    return (
      <div className="px-5 py-12 text-center text-sm text-muted">
        No recent quotes.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-y border-edge bg-bg/40 text-2xs uppercase tracking-[0.12em] text-subtle">
            <th className="px-5 py-3 text-left font-medium">When</th>
            <th className="px-3 py-3 text-right font-medium">Effective rate</th>
            <th className="px-3 py-3 text-right font-medium">Δ vs mid</th>
            <th className="px-3 py-3 text-right font-medium">Receive ({to})</th>
            <th className="px-5 py-3 text-right font-medium">Fee ({from})</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const rate = r.effectiveRate ?? r.receiveAmount / r.sendAmount;
            const delta = midRate ? ((rate - midRate) / midRate) * 100 : null;
            return (
              <tr key={r.t} className="border-b border-edge/60 last:border-b-0">
                <td className="px-5 py-3 text-2xs uppercase tracking-[0.12em] text-muted">
                  {new Date(r.t).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                  })}
                </td>
                <td className="tabular px-3 py-3 text-right font-mono text-text">
                  {rate.toFixed(4)}
                </td>
                <td className="px-3 py-3 text-right">
                  {delta === null ? (
                    <span className="text-subtle">—</span>
                  ) : (
                    <DeltaBadge value={delta} />
                  )}
                </td>
                <td className="tabular px-3 py-3 text-right font-mono text-text">
                  {r.receiveAmount.toLocaleString('en-US', {
                    maximumFractionDigits: 2,
                  })}
                </td>
                <td className="tabular px-5 py-3 text-right font-mono text-muted">
                  {r.feeAmount.toLocaleString('en-US', {
                    maximumFractionDigits: 2,
                  })}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
