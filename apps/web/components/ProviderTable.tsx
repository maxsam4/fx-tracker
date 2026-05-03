'use client';
import Link from 'next/link';
import { Pill, StatusDot } from './ui/Pill';
import { DerivedRateRow } from './DerivedRateRow';

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
  kind: 'provider' | 'reference' | 'median';
  id: string;
  dataSource: string | null;
  capturedAt: string;
  sendAmount: number;
  receiveAmount: number | null;
  effectiveRate: number;
  rawRate: number;
  feeAmount: number | null;
}

// Friendly labels for reference source IDs (kept short to fit the table).
const REFERENCE_LABELS: Record<string, string> = {
  wiseMidMarket: 'Wise mid',
  xe: 'XE',
  exchangerateHost: 'open.er-api',
  googleFinance: 'Google Finance',
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

  // The median itself is shown as its own row in the table — useful for
  // comparing each provider against the canonical mid without flicking
  // back to the hero stat.
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

  const all = [
    ...providerRows,
    ...referenceRows,
    ...(medianRow ? [medianRow] : []),
  ].sort((a, b) => b.effectiveRate - a.effectiveRate);

  // Provider-only rank: best provider is #01, regardless of how many
  // mid feeds / median / derived rows sit above it in the sort. Mid
  // feeds and derived rows render `—` in the # column.
  const providerRanks = new Map<string, number>();
  {
    let n = 0;
    for (const r of all) {
      if (r.kind === 'provider') {
        providerRanks.set(r.id, ++n);
      }
    }
  }

  // For the delta-vs-mid bar viz, normalize across the visible range.
  const deltas = midRate
    ? all.map((r) => ((r.effectiveRate - midRate) / midRate) * 100)
    : [];
  const maxAbsDelta = deltas.length ? Math.max(...deltas.map(Math.abs), 0.5) : 1;

  const presentIds = new Set(rows.map((r) => r.providerId));
  const statusByProvider = new Map(runStatus.map((s) => [s.providerId, s] as const));
  const missing = configuredProviders.filter((p) => !presentIds.has(p));

  if (all.length === 0 && missing.length === 0) {
    return (
      <div className="px-5 py-12 text-center text-sm text-muted">
        No provider quotes captured yet for this amount.
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-y border-edge bg-bg/40 text-2xs uppercase tracking-[0.12em] text-subtle">
              <th className="px-5 py-3 text-left font-medium">#</th>
              <th className="px-3 py-3 text-left font-medium">Provider</th>
              <th className="px-3 py-3 text-right font-medium">Raw rate</th>
              <th className="px-3 py-3 text-right font-medium">Effective rate</th>
              <th className="px-3 py-3 text-left font-medium">Δ vs mid</th>
              <th className="px-3 py-3 text-right font-medium">Receive ({toCurrency})</th>
              <th className="px-3 py-3 text-right font-medium">Fee ({fromCurrency})</th>
              <th className="px-5 py-3 text-right font-medium">Updated</th>
            </tr>
          </thead>
          <tbody>
            {pairKey === 'AED-INR' && (
              <DerivedRateRow
                sendAmount={sendAmount}
                fromCurrency={fromCurrency}
                toCurrency={toCurrency}
                midRate={midRate}
              />
            )}
            {all.map((r, i) => {
              // Median row IS the baseline — its delta is by definition 0,
              // showing it would be visual noise.
              const delta =
                r.kind === 'median' || midRate === null
                  ? null
                  : ((r.effectiveRate - midRate) / midRate) * 100;
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
                  sendAmount={sendAmount}
                  toCurrency={toCurrency}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      {missing.length > 0 && (
        <div className="border-t border-edge bg-bg/40 px-5 py-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-2xs uppercase tracking-[0.14em] text-subtle">
              Configured · not reporting
            </span>
            <span className="tabular font-mono text-2xs text-muted">
              {missing.length}
            </span>
          </div>
          <ul className="grid gap-1.5 sm:grid-cols-2">
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
                  className="flex flex-wrap items-center gap-2 rounded border border-edge bg-surface px-3 py-2 text-xs"
                >
                  <StatusDot status={tone} />
                  <span className="font-mono font-medium text-text">{id}</span>
                  <span className="text-2xs uppercase tracking-[0.12em] text-muted">
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
  sendAmount,
  toCurrency,
}: {
  row: UnifiedRow;
  rank: number | null;
  delta: number | null;
  maxAbsDelta: number;
  isBest: boolean;
  pairKey: string;
  sendAmount: number;
  toCurrency: string;
}) {
  const isProvider = row.kind === 'provider';
  const isMedian = row.kind === 'median';
  const isReference = row.kind === 'reference';
  const deltaTone =
    delta === null
      ? 'text-subtle'
      : delta > 0
        ? 'text-accent'
        : delta > -0.1
          ? 'text-warn'
          : delta > -0.3
            ? 'text-caution'
            : 'text-bad';

  return (
    <tr
      className={`group relative border-b border-edge/60 last:border-b-0 transition-colors ${
        isProvider ? 'hover:bg-elevated/60' : isMedian ? 'bg-accent/[0.04]' : 'bg-bg/30'
      }`}
    >
      <td className="relative px-5 py-3.5">
        {isBest && (
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 w-0.5 bg-accent shadow-[0_0_12px_rgb(var(--accent)/0.6)]"
          />
        )}
        <span
          className={`tabular font-mono text-2xs ${
            isBest ? 'text-accent' : 'text-subtle'
          }`}
        >
          {rank !== null ? String(rank).padStart(2, '0') : '—'}
        </span>
      </td>

      <td className="px-3 py-3.5">
        <div className="flex flex-wrap items-center gap-2">
          {isMedian ? (
            <>
              <span className="font-mono text-sm font-medium text-text">mid-market</span>
              <Pill tone="accent">median</Pill>
            </>
          ) : isReference ? (
            <>
              <span className="font-mono text-sm text-muted">
                {REFERENCE_LABELS[row.id] ?? row.id}
              </span>
              <Pill tone="muted">mid feed</Pill>
            </>
          ) : (
            <>
              <Link
                href={`/${encodeURIComponent(pairKey)}/providers/${encodeURIComponent(row.id)}`}
                className="font-mono text-sm font-medium text-text transition-colors hover:text-accent"
              >
                {row.id}
              </Link>
              {isBest && <Pill tone="accent">best</Pill>}
              {row.dataSource && (
                <Pill tone={dataSourceTone(row.dataSource)} mono>
                  {dataSourceLabel(row.dataSource)}
                </Pill>
              )}
            </>
          )}
        </div>
      </td>

      <td
        className={`tabular px-3 py-3.5 text-right font-mono text-sm ${
          isReference ? 'text-muted' : 'text-subtle'
        }`}
      >
        {row.rawRate.toFixed(4)}
      </td>

      <td className="px-3 py-3.5 text-right">
        <span
          className={`tabular font-mono text-sm font-medium ${
            isReference ? 'text-muted' : 'text-text'
          }`}
        >
          {row.effectiveRate.toFixed(4)}
        </span>
      </td>

      <td className="px-3 py-3.5">
        <DeltaCell delta={delta} maxAbsDelta={maxAbsDelta} tone={deltaTone} />
      </td>

      <td
        className={`tabular px-3 py-3.5 text-right font-mono text-sm ${
          isReference ? 'text-muted' : 'text-text'
        }`}
      >
        {row.receiveAmount === null ? '—' : fmt(row.receiveAmount)}
      </td>

      <td
        className={`tabular px-3 py-3.5 text-right font-mono text-sm ${
          isReference || row.feeAmount === null ? 'text-subtle' : 'text-muted'
        }`}
      >
        {row.feeAmount === null ? '—' : fmt(row.feeAmount)}
      </td>

      <td className="px-5 py-3.5 text-right text-2xs uppercase tracking-[0.12em] text-subtle">
        {ago(row.capturedAt)}
      </td>
    </tr>
  );
}

function DeltaCell({
  delta,
  maxAbsDelta,
  tone,
}: {
  delta: number | null;
  maxAbsDelta: number;
  tone: string;
}) {
  if (delta === null) {
    return <span className="text-subtle">—</span>;
  }
  // Bar fills from center; negative = left, positive = right.
  const halfPct = (Math.abs(delta) / maxAbsDelta) * 50;
  const isNeg = delta < 0;
  const barColor =
    delta > 0
      ? 'bg-accent'
      : delta > -0.1
        ? 'bg-warn'
        : delta > -0.3
          ? 'bg-caution'
          : 'bg-bad';

  return (
    <div className="flex items-center gap-2">
      <span className={`tabular font-mono text-xs font-medium ${tone} min-w-[3.25rem]`}>
        {delta >= 0 ? '+' : ''}
        {delta.toFixed(2)}%
      </span>
      <div className="relative h-1 w-16 overflow-hidden rounded-full bg-edge sm:w-24">
        <span
          aria-hidden
          className="absolute inset-y-0 left-1/2 w-px bg-edge-strong"
        />
        <span
          aria-hidden
          className={`absolute inset-y-0 ${barColor} ${
            isNeg ? 'right-1/2' : 'left-1/2'
          }`}
          style={{ width: `${halfPct}%` }}
        />
      </div>
    </div>
  );
}

const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

// Map a Quote.dataSource string to a short visible label.
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

// Highlight promo / advisory paths so the user knows the rate isn't directly
// comparable to the others.
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
