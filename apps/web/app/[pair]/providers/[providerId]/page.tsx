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
import { Card, CardHeader } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';
import { DeltaBadge } from '@/components/ui/Stat';

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

const PROVIDER_LABELS: Record<string, string> = {
  wise: 'Wise',
  remitly: 'Remitly',
  instarem: 'Instarem',
  aspora: 'Aspora',
  xoom: 'Xoom',
  westernUnion: 'Western Union',
  careemPay: 'CareemPay',
  remitfinder: 'Remitfinder',
  lulu: 'LuluXchange',
  masarif: 'Masarif',
};

export default async function ProviderPage({
  params,
  searchParams,
}: {
  params: { pair: string; providerId: string };
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

  const providerId = decodeURIComponent(params.providerId);
  const sendAmount = pairCfg.referenceAmounts[0]!;
  const activeWindow = searchParams.window ?? '30d';
  const windowMs = WINDOW_MS[activeWindow] ?? WINDOW_MS['30d']!;

  const pairId = await getPairId(pair);
  if (!pairId) {
    return (
      <div className="rounded-2xl border border-edge bg-surface px-8 py-12 text-center">
        <h2 className="display text-3xl font-normal text-text">No data yet for {pairKey}</h2>
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
  const latestRate =
    latest?.effectiveRate ?? (latest ? latest.receiveAmount / latest.sendAmount : null);
  const deltaVsMid =
    latestRate !== null && mid ? ((latestRate - mid.rate) / mid.rate) * 100 : null;

  const providerLabel = PROVIDER_LABELS[providerId] ?? providerId;

  return (
    <div className="stagger space-y-10">
      {/* HEADER */}
      <section className="relative overflow-hidden rounded-2xl border border-edge rate-ribbon">
        <div className="pointer-events-none absolute inset-0 paper-grain opacity-40" aria-hidden />
        <div className="relative grid gap-10 px-8 pb-10 pt-9 md:grid-cols-[1.4fr_1fr] md:px-12 md:pb-12 md:pt-10">
          <div className="flex flex-col gap-7">
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={`/${pairKey}`}
                className="font-sans text-2xs uppercase tracking-[0.22em] text-muted transition-colors hover:text-text"
              >
                ← {pairKey}
              </Link>
              <span className="text-subtle">/</span>
              <span className="font-sans text-2xs uppercase tracking-[0.22em] text-subtle">
                provider
              </span>
            </div>
            <div className="flex flex-wrap items-baseline gap-4">
              <h1 className="display text-6xl font-normal leading-none text-text">
                {providerLabel}
              </h1>
              <Pill tone="muted" mono>
                {pair.from} → {pair.to}
              </Pill>
            </div>
            <div className="flex flex-col gap-2">
              <span className="font-sans text-2xs font-medium uppercase tracking-[0.22em] text-subtle">
                Latest effective rate · sending {sendAmount} {pair.from}
              </span>
              <div className="flex flex-wrap items-baseline gap-4">
                <span className="rate-display text-7xl font-light text-text">
                  {latestRate !== null ? latestRate.toFixed(4) : '—'}
                </span>
                <span className="font-sans text-sm font-medium uppercase tracking-[0.18em] text-muted">
                  {pair.to} per {pair.from}
                </span>
                {deltaVsMid !== null && (
                  <DeltaBadge value={deltaVsMid} label="vs mid" />
                )}
              </div>
            </div>
          </div>

          <aside className="grid content-end gap-4">
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
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1.5">
          <h2 className="display text-3xl font-normal leading-tight text-text">
            History
          </h2>
          <p className="font-sans text-sm text-muted">
            {providerLabel} after advertised fees, against the live mid-market.
          </p>
        </div>
        <div className="inline-flex rounded-full border border-edge bg-surface/80 p-1 backdrop-blur">
          {WINDOW_KEYS.map((k) => (
            <Link
              key={k}
              href={`/${pairKey}/providers/${encodeURIComponent(providerId)}?window=${k}`}
              className={`tabular rounded-full px-3.5 py-1.5 font-sans text-xs font-medium transition-all ${
                k === activeWindow ? 'bg-text text-bg shadow-sm' : 'text-muted hover:text-text'
              }`}
            >
              {k}
            </Link>
          ))}
        </div>
      </section>

      {/* CHART */}
      <Card>
        <div className="px-2 pb-3 pt-1 md:px-4">
          {providerSeries.length === 0 ? (
            <div className="py-20 text-center font-sans text-sm text-muted">
              No history captured yet for {providerLabel} at this amount.
            </div>
          ) : (
            <ProviderHistoryChart
              providerSeries={providerSeries.map((s) => ({
                t: s.t,
                rate: s.effectiveRate ?? s.receiveAmount / s.sendAmount,
                rawRate: s.receiveAmount / s.sendAmount,
              }))}
              midSeries={midSeries.map((m) => ({ t: m.t, rate: m.rate }))}
              providerLabel={providerLabel}
            />
          )}
        </div>
      </Card>

      {/* RECENT QUOTES */}
      <Card>
        <CardHeader
          title="Recent quotes"
          subtitle="captured at hourly polls"
          right={
            <span className="font-sans text-2xs uppercase tracking-[0.18em] text-subtle">
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
    <div className="rounded-xl border border-edge bg-surface/40 px-5 py-4 backdrop-blur">
      <div className="font-sans text-2xs font-medium uppercase tracking-[0.22em] text-subtle">
        {label}
      </div>
      <div className="tabular mt-2 font-sans text-2xl font-medium text-text">{value}</div>
      {hint && (
        <div className="mt-1 font-sans text-2xs uppercase tracking-[0.16em] text-muted">
          {hint}
        </div>
      )}
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
      <div className="px-7 py-16 text-center font-sans text-sm text-muted">
        No recent quotes.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-edge text-2xs font-medium uppercase tracking-[0.18em] text-subtle">
            <th className="px-7 py-4 text-left">When</th>
            <th className="px-3 py-4 text-right">Effective rate</th>
            <th className="px-3 py-4 text-right">Δ vs mid</th>
            <th className="px-3 py-4 text-right">Receive ({to})</th>
            <th className="px-7 py-4 text-right">Fee ({from})</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const rate = r.effectiveRate ?? r.receiveAmount / r.sendAmount;
            const delta = midRate ? ((rate - midRate) / midRate) * 100 : null;
            return (
              <tr
                key={r.t}
                className="border-b border-edge/40 transition-colors last:border-b-0 hover:bg-elevated/40"
              >
                <td className="px-7 py-4 font-sans text-2xs uppercase tracking-[0.16em] text-muted">
                  {new Date(r.t).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                  })}
                </td>
                <td className="tabular px-3 py-4 text-right font-mono text-base text-text">
                  {rate.toFixed(4)}
                </td>
                <td className="px-3 py-4 text-right">
                  {delta === null ? (
                    <span className="text-subtle">—</span>
                  ) : (
                    <DeltaBadge value={delta} />
                  )}
                </td>
                <td className="tabular px-3 py-4 text-right font-mono text-base text-text">
                  {r.receiveAmount.toLocaleString('en-US', {
                    maximumFractionDigits: 2,
                  })}
                </td>
                <td className="tabular px-7 py-4 text-right font-mono text-sm text-muted">
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
