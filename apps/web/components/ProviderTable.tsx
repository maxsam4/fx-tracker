'use client';
import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { Pill, StatusDot } from './ui/Pill';
import { DerivedRateRow } from './DerivedRateRow';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface UsdInrTableRow {
  providerId: string;
  effectiveRate: number;
}

interface UsdInrApiResponse {
  table?: UsdInrTableRow[];
  mid?: { rate: number } | null;
}

interface Row {
  providerId: string;
  dataSource: string;
  capturedAt: string;
  sendAmount: number;
  receiveAmount: number;
  effectiveRate: number;
  feeAmount: number;
  rate: number;
}
interface RefLatest {
  sourceId: string;
  capturedAt: string;
  rate: number;
}
interface RunStatus {
  providerId: string;
  status: string;
  errorMessage: string | null;
  startedAt: string;
}

interface UnifiedRow {
  kind: 'provider' | 'reference' | 'median' | 'derived';
  id: string;
  dataSource: string | null;
  capturedAt: string;
  sendAmount: number;
  receiveAmount: number | null;
  effectiveRate: number;
  rawRate: number;
  feeAmount: number | null;
}

const REFERENCE_LABELS: Record<string, string> = {
  wiseMidMarket: 'Wise mid',
  xe: 'XE',
  exchangerateHost: 'open.er-api',
  googleFinance: 'Google Finance',
  visa: 'Visa',
  frankfurter: 'Frankfurter (ECB)',
  twelveData: 'Twelve Data',
  revolut: 'Revolut',
  yahooFinance: 'Yahoo Finance',
};

// Map provider IDs to a friendlier display name. Falls back to the raw id.
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

export function ProviderTable({
  rows,
  refLatest,
  runStatus,
  configuredProviders,
  midRate,
  midCapturedAt,
  fromCurrency,
  toCurrency,
  sendAmount,
  pairKey,
}: {
  rows: Row[];
  refLatest: RefLatest[];
  runStatus: RunStatus[];
  configuredProviders: string[];
  midRate: number | null;
  midCapturedAt: string | null;
  fromCurrency: string;
  toCurrency: string;
  sendAmount: number;
  pairKey: string;
}) {
  const isAedInr = pairKey === 'AED-INR';

  const { data: usdInrData } = useSWR<UsdInrApiResponse>(
    isAedInr ? '/api/rates/USD-INR' : null,
    fetcher,
    { refreshInterval: 60_000 },
  );
  const usdInrRates = (usdInrData?.table ?? []).filter(
    (r) => Number.isFinite(r.effectiveRate) && r.effectiveRate > 0,
  );
  const usdInrMid = usdInrData?.mid?.rate ?? null;
  const bestUsdInr =
    usdInrRates.length > 0 ? Math.max(...usdInrRates.map((r) => r.effectiveRate)) : null;

  const [selUsdInr, setSelUsdInr] = useState<string>('mid');
  const [selUsdAed, setSelUsdAed] = useState<string>('3.67250');

  let usdInrValue: number | null = null;
  if (selUsdInr === 'best') {
    usdInrValue = bestUsdInr;
  } else if (selUsdInr === 'mid') {
    usdInrValue = usdInrMid;
  } else {
    const n = parseFloat(selUsdInr);
    usdInrValue = Number.isFinite(n) && n > 0 ? n : null;
  }
  const usdAedValue = parseFloat(selUsdAed);
  const derivedRate =
    usdInrValue !== null && Number.isFinite(usdAedValue) && usdAedValue > 0
      ? usdInrValue / usdAedValue
      : null;

  const providerRows: UnifiedRow[] = rows.map((r) => ({
    kind: 'provider',
    id: r.providerId,
    dataSource: r.dataSource,
    capturedAt: r.capturedAt,
    sendAmount: r.sendAmount,
    receiveAmount: r.receiveAmount,
    effectiveRate: r.effectiveRate,
    rawRate: r.rate,
    feeAmount: r.feeAmount,
  }));

  const referenceRows: UnifiedRow[] = refLatest.map((r) => ({
    kind: 'reference',
    id: r.sourceId,
    dataSource: null,
    capturedAt: r.capturedAt,
    sendAmount,
    receiveAmount: sendAmount * r.rate,
    effectiveRate: r.rate,
    rawRate: r.rate,
    feeAmount: null,
  }));

  const medianRow: UnifiedRow | null =
    midRate !== null && midCapturedAt
      ? {
          kind: 'median',
          id: 'mid-market',
          dataSource: null,
          capturedAt: midCapturedAt,
          sendAmount,
          receiveAmount: sendAmount * midRate,
          effectiveRate: midRate,
          rawRate: midRate,
          feeAmount: null,
        }
      : null;

  const derivedRow: UnifiedRow | null =
    isAedInr && derivedRate !== null
      ? {
          kind: 'derived',
          id: 'derived',
          dataSource: null,
          capturedAt: new Date().toISOString(),
          sendAmount,
          receiveAmount: sendAmount * derivedRate,
          effectiveRate: derivedRate,
          rawRate: derivedRate,
          feeAmount: null,
        }
      : null;

  const all = [
    ...providerRows,
    ...referenceRows,
    ...(medianRow ? [medianRow] : []),
    ...(derivedRow ? [derivedRow] : []),
  ].sort((a, b) => b.effectiveRate - a.effectiveRate);

  const providerRanks = new Map<string, number>();
  {
    let n = 0;
    for (const r of all) {
      if (r.kind === 'provider') providerRanks.set(r.id, ++n);
    }
  }

  const deltas = midRate
    ? all.map((r) => ((r.effectiveRate - midRate) / midRate) * 100)
    : [];
  const maxAbsDelta = deltas.length ? Math.max(...deltas.map(Math.abs), 0.5) : 1;

  const presentIds = new Set(rows.map((r) => r.providerId));
  const statusByProvider = new Map(runStatus.map((s) => [s.providerId, s] as const));
  const missing = configuredProviders.filter((p) => !presentIds.has(p));

  if (all.length === 0 && missing.length === 0) {
    return (
      <div className="px-7 py-16 text-center font-sans text-sm text-muted">
        No provider quotes captured yet for this amount.
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-edge text-2xs font-medium uppercase tracking-[0.18em] text-subtle">
              <th className="px-7 py-4 text-left">#</th>
              <th className="px-2 py-4 text-left">Provider</th>
              <th className="px-3 py-4 text-right">Rate</th>
              <th className="px-3 py-4 text-left">Δ vs mid</th>
              <th className="px-3 py-4 text-right">You receive</th>
              <th className="px-3 py-4 text-right">Fee</th>
              <th className="px-7 py-4 text-right">Updated</th>
            </tr>
          </thead>
          <tbody>
            {all.map((r, i) => {
              const delta =
                r.kind === 'median' || midRate === null
                  ? null
                  : ((r.effectiveRate - midRate) / midRate) * 100;

              if (r.kind === 'derived') {
                return (
                  <DerivedRateRow
                    key="derived"
                    rate={r.effectiveRate}
                    receiveAmount={r.receiveAmount}
                    delta={delta}
                    fromCurrency={fromCurrency}
                    toCurrency={toCurrency}
                    selUsdInr={selUsdInr}
                    setSelUsdInr={setSelUsdInr}
                    selUsdAed={selUsdAed}
                    setSelUsdAed={setSelUsdAed}
                    usdInrMid={usdInrMid}
                    bestUsdInr={bestUsdInr}
                    usdInrRates={usdInrRates}
                  />
                );
              }

              const isProvider = r.kind === 'provider';
              const isBest =
                isProvider && all.findIndex((x) => x.kind === 'provider') === i;
              const rank = isProvider ? providerRanks.get(r.id) ?? null : null;

              return (
                <RowComponent
                  key={`${r.kind}:${r.id}`}
                  row={r}
                  rank={rank}
                  delta={delta}
                  maxAbsDelta={maxAbsDelta}
                  isBest={isBest}
                  pairKey={pairKey}
                  toCurrency={toCurrency}
                  fromCurrency={fromCurrency}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      {missing.length > 0 && (
        <div className="border-t border-edge/60 bg-elevated/40 px-7 py-5">
          <div className="mb-3 flex items-center gap-3">
            <span className="font-sans text-2xs font-medium uppercase tracking-[0.22em] text-subtle">
              Configured · not reporting
            </span>
            <span className="tabular rounded-full border border-edge bg-surface px-2 py-0.5 font-mono text-2xs text-muted">
              {missing.length}
            </span>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {missing.map((id) => {
              const s = statusByProvider.get(id);
              const tone =
                s?.status === 'ok' ? 'ok'
                : s?.status === 'timeout' ? 'warn'
                : s?.status ? 'bad'
                : 'idle';
              return (
                <li
                  key={id}
                  className="flex flex-wrap items-center gap-2.5 rounded-lg border border-edge bg-surface px-4 py-3 font-sans text-xs"
                >
                  <StatusDot status={tone} />
                  <span className="font-sans font-medium text-text">
                    {PROVIDER_LABELS[id] ?? id}
                  </span>
                  <span className="font-sans text-2xs uppercase tracking-[0.16em] text-muted">
                    {s?.status ?? 'no run'}
                  </span>
                  {s?.errorMessage && (
                    <span className="grow truncate text-subtle" title={s.errorMessage}>
                      — {truncate(s.errorMessage, 60)}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function RowComponent({
  row,
  rank,
  delta,
  maxAbsDelta,
  isBest,
  pairKey,
  toCurrency,
  fromCurrency,
}: {
  row: UnifiedRow;
  rank: number | null;
  delta: number | null;
  maxAbsDelta: number;
  isBest: boolean;
  pairKey: string;
  toCurrency: string;
  fromCurrency: string;
}) {
  const isProvider = row.kind === 'provider';
  const isMedian = row.kind === 'median';
  const isReference = row.kind === 'reference';

  const rowBg = isMedian
    ? 'bg-accent/[0.05]'
    : isReference
      ? 'bg-bg/30'
      : 'hover:bg-elevated/50 transition-colors';

  return (
    <tr className={`group border-b border-edge/40 last:border-b-0 ${rowBg}`}>
      {/* RANK */}
      <td className="px-7 py-5">
        {rank !== null ? (
          <RankBadge n={rank} isBest={isBest} />
        ) : isMedian ? (
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-accent/40 bg-accent/10 font-sans text-xs">
            <span className="h-1.5 w-1.5 rounded-full bg-accent dot-glow-accent" />
          </span>
        ) : (
          <span className="font-sans text-xs text-subtle">—</span>
        )}
      </td>

      {/* PROVIDER */}
      <td className="px-2 py-5">
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            {isMedian ? (
              <>
                <span className="font-sans text-base font-medium text-text">Mid-market median</span>
                <Pill tone="accent">benchmark</Pill>
              </>
            ) : isReference ? (
              <>
                <span className="font-sans text-base text-muted">
                  {REFERENCE_LABELS[row.id] ?? row.id}
                </span>
                <Pill tone="muted">mid feed</Pill>
              </>
            ) : (
              <>
                <Link
                  href={`/${encodeURIComponent(pairKey)}/providers/${encodeURIComponent(row.id)}`}
                  className="font-sans text-base font-medium text-text transition-colors hover:text-accent"
                >
                  {PROVIDER_LABELS[row.id] ?? row.id}
                </Link>
                {isBest && <Pill tone="accent">best deal</Pill>}
                {row.dataSource && (
                  <Pill tone={dataSourceTone(row.dataSource)}>
                    {dataSourceLabel(row.dataSource)}
                  </Pill>
                )}
              </>
            )}
          </div>
          {isProvider && (
            <span className="tabular font-mono text-2xs text-subtle">
              raw {row.rawRate.toFixed(4)} · sending{' '}
              {row.sendAmount.toLocaleString('en-US')} {fromCurrency}
            </span>
          )}
        </div>
      </td>

      {/* RATE */}
      <td className="px-3 py-5 text-right">
        <span
          className={`tabular block font-mono text-lg ${
            isReference ? 'text-muted font-normal' : 'text-text font-medium'
          }`}
        >
          {row.effectiveRate.toFixed(4)}
        </span>
        <span className="font-sans text-2xs uppercase tracking-[0.16em] text-subtle">
          {toCurrency} / {fromCurrency}
        </span>
      </td>

      {/* DELTA */}
      <td className="px-3 py-5">
        <DeltaCell delta={delta} maxAbsDelta={maxAbsDelta} />
      </td>

      {/* RECEIVE */}
      <td className="px-3 py-5 text-right">
        <span
          className={`tabular block font-mono text-base ${
            isReference ? 'text-muted' : 'text-text font-medium'
          }`}
        >
          {row.receiveAmount === null ? '—' : fmt(row.receiveAmount)}
        </span>
        <span className="font-sans text-2xs uppercase tracking-[0.16em] text-subtle">
          {toCurrency}
        </span>
      </td>

      {/* FEE */}
      <td className="px-3 py-5 text-right">
        <span
          className={`tabular font-mono text-sm ${
            row.feeAmount === null ? 'text-subtle' : row.feeAmount > 0 ? 'text-muted' : 'text-good'
          }`}
        >
          {row.feeAmount === null
            ? '—'
            : row.feeAmount === 0
              ? 'free'
              : fmt(row.feeAmount)}
        </span>
      </td>

      {/* UPDATED */}
      <td className="px-7 py-5 text-right">
        <span className="font-sans text-2xs uppercase tracking-[0.16em] text-subtle">
          {ago(row.capturedAt)}
        </span>
      </td>
    </tr>
  );
}

function RankBadge({ n, isBest }: { n: number; isBest: boolean }) {
  return (
    <span
      className={`tabular relative inline-flex h-9 w-9 items-center justify-center rounded-full border font-sans text-sm font-medium ${
        isBest
          ? 'border-accent/50 bg-accent/15 text-accent shadow-glow'
          : n <= 3
            ? 'border-edge-strong bg-elevated text-text'
            : 'border-edge bg-surface text-muted'
      }`}
    >
      {n}
      {isBest && (
        <span
          aria-hidden
          className="absolute -inset-1 rounded-full border border-accent/30"
        />
      )}
    </span>
  );
}

function DeltaCell({
  delta,
  maxAbsDelta,
}: {
  delta: number | null;
  maxAbsDelta: number;
}) {
  if (delta === null) {
    return <span className="font-sans text-xs text-subtle">—</span>;
  }
  const halfPct = (Math.abs(delta) / maxAbsDelta) * 50;
  const isNeg = delta < 0;
  const tone =
    delta > 0
      ? 'text-accent'
      : delta > -0.1
        ? 'text-warn'
        : delta > -0.3
          ? 'text-caution'
          : 'text-bad';
  const barColor =
    delta > 0
      ? 'bg-accent'
      : delta > -0.1
        ? 'bg-warn'
        : delta > -0.3
          ? 'bg-caution'
          : 'bg-bad';

  return (
    <div className="flex items-center gap-3">
      <span className={`tabular font-sans text-sm font-medium ${tone} min-w-[3.75rem]`}>
        {delta >= 0 ? '+' : ''}
        {delta.toFixed(2)}%
      </span>
      <div className="relative h-1.5 w-20 overflow-hidden rounded-full bg-edge sm:w-32">
        <span
          aria-hidden
          className="absolute inset-y-0 left-1/2 w-px bg-edge-strong"
        />
        <span
          aria-hidden
          className={`absolute inset-y-0 ${barColor} ${
            isNeg ? 'right-1/2' : 'left-1/2'
          } rounded-sm shadow-[0_0_8px_currentColor] opacity-90`}
          style={{ width: `${halfPct}%` }}
        />
      </div>
    </div>
  );
}

const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

function dataSourceLabel(ds: string): string {
  switch (ds) {
    case 'remitly_promo':
      return 'promo';
    case 'remitly_standard':
      return 'standard';
    case 'wise_comparisons':
      return 'wise comp';
    case 'wise_api':
      return 'wise api';
    case 'aspora_api':
      return 'aspora api';
    case 'instarem_api':
      return 'instarem api';
    case 'masarif':
      return 'masarif';
    case 'lulu_direct':
      return 'lulu';
    case 'remitly_ssr_promo':
      return 'promo (ssr)';
    default:
      return ds;
  }
}

function dataSourceTone(ds: string): 'neutral' | 'accent' | 'warn' | 'muted' {
  if (ds === 'remitly_promo' || ds === 'remitly_ssr_promo') return 'warn';
  if (ds === 'remitly_standard' || ds === 'wise_comparisons') return 'accent';
  return 'muted';
}

function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
