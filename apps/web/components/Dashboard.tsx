'use client';
import useSWR from 'swr';
import type { CurrencyPair } from '@fx/core';
import { MidMarketChart } from './MidMarketChart';
import { ProviderTable } from './ProviderTable';
import { WindowControls } from './WindowControls';
import { Card, CardBody, CardHeader } from './ui/Card';
import { Pill, StatusDot } from './ui/Pill';
import { Stat } from './ui/Stat';

interface MidPoint { t: string; rate: number; sources: string[]; }
interface RefPoint { t: string; rate: number; sourceId: string; }
interface TableRow {
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

interface Props {
  pairKey: string;
  pair: CurrencyPair;
  sendAmount: number;
  configuredProviders: string[];
  windowMs: number;
  mid: { rate: number; capturedAt: string; sources: string[] } | null;
  midSeries: MidPoint[];
  refSeries: RefPoint[];
  table: TableRow[];
  refLatest: RefLatest[];
  runStatus: RunStatus[];
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function Dashboard(initial: Props) {
  // SWR auto-refresh — keeps the UI live every 60s without a full reload.
  const swrKey = `/api/rates/${encodeURIComponent(initial.pairKey)}?window=${initial.windowMs}`;
  const { data } = useSWR(swrKey, fetcher, {
    refreshInterval: 60_000,
    fallbackData: {
      mid: initial.mid,
      midSeries: initial.midSeries,
      refSeries: initial.refSeries,
      table: initial.table,
      refLatest: initial.refLatest,
      runStatus: initial.runStatus,
    },
    revalidateOnFocus: true,
  });

  const mid = data?.mid ?? initial.mid;
  const midSeries: MidPoint[] = data?.midSeries ?? initial.midSeries;
  const refSeries: RefPoint[] = data?.refSeries ?? initial.refSeries;
  const table: TableRow[] = data?.table ?? initial.table;
  const refLatest: RefLatest[] = data?.refLatest ?? initial.refLatest;
  const runStatus: RunStatus[] = data?.runStatus ?? initial.runStatus;

  const delta24h = computeDelta(midSeries, mid?.rate);
  const range = computeRange(midSeries);
  const freshness = mid ? freshnessTone(mid.capturedAt) : 'idle';

  return (
    <div className="stagger space-y-8">
      {/* HERO */}
      <section className="relative overflow-hidden rounded-md border border-edge bg-surface">
        <div className="pointer-events-none absolute inset-0 hero-glow" aria-hidden />
        <div className="relative grid gap-8 px-6 py-8 md:grid-cols-[1.4fr_1fr] md:px-8 md:py-10">
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <span className="font-display text-2xl italic leading-none text-muted">
                pair
              </span>
              <h1 className="tabular font-mono text-xl font-medium tracking-tight text-text">
                <span className="text-subtle">{initial.pair.from}</span>
                <span className="mx-1.5 text-subtle">→</span>
                <span>{initial.pair.to}</span>
              </h1>
              <Pill tone={freshness === 'ok' ? 'accent' : freshness === 'warn' ? 'warn' : 'muted'}>
                <StatusDot status={freshness} />
                <span>{mid ? `live · ${timeAgo(mid.capturedAt)}` : 'no data'}</span>
              </Pill>
            </div>

            <Stat
              label="Mid-market rate"
              value={mid ? formatRate(mid.rate) : '—'}
              unit={mid ? `${initial.pair.to} per ${initial.pair.from}` : undefined}
              delta={delta24h !== null ? { value: delta24h, label: '24h' } : null}
              size="lg"
            />

            {mid && mid.sources.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-2xs uppercase tracking-[0.14em] text-subtle">
                  Sources
                </span>
                {mid.sources.map((s: string) => (
                  <Pill key={s} tone="neutral" mono>
                    {s}
                  </Pill>
                ))}
              </div>
            )}
          </div>

          {/* HERO META */}
          <div className="grid gap-3 self-end md:grid-cols-2">
            <MetaTile
              label="Window high"
              value={range ? formatRate(range.max) : '—'}
            />
            <MetaTile
              label="Window low"
              value={range ? formatRate(range.min) : '—'}
            />
            <MetaTile
              label="Reference sources"
              value={refLatest.length || '—'}
              suffix={refLatest.length ? 'feeds' : undefined}
            />
            <MetaTile
              label="Providers tracked"
              value={initial.configuredProviders.length}
              suffix="active"
            />
          </div>
        </div>
      </section>

      {/* CONTROLS */}
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-2xs uppercase tracking-[0.16em] text-subtle">
          Comparison settings
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <WindowControls pairKey={initial.pairKey} currentMs={initial.windowMs} />
        </div>
      </section>

      {/* CHART */}
      <Card>
        <CardHeader
          title="Mid-market & references"
          subtitle="median of independent feeds vs each individual source"
        />
        <CardBody className="px-2 pb-3 pt-1">
          <MidMarketChart midSeries={midSeries} refSeries={refSeries} />
        </CardBody>
      </Card>

      {/* PROVIDER TABLE */}
      <Card>
        <CardHeader
          title={`Provider quotes — sending ${formatAmount(initial.sendAmount)} ${initial.pair.from}`}
          subtitle="effective rate accounts for advertised fees · sorted by best receive"
          right={
            <div className="text-2xs uppercase tracking-[0.14em] text-subtle">
              {table.length} live
            </div>
          }
        />
        <ProviderTable
          rows={table}
          refLatest={refLatest}
          runStatus={runStatus}
          configuredProviders={initial.configuredProviders}
          midRate={mid?.rate ?? null}
          fromCurrency={initial.pair.from}
          toCurrency={initial.pair.to}
          sendAmount={initial.sendAmount}
          pairKey={initial.pairKey}
        />
      </Card>
    </div>
  );
}

function MetaTile({
  label,
  value,
  suffix,
}: {
  label: string;
  value: string | number;
  suffix?: string;
}) {
  return (
    <div className="rounded border border-edge bg-bg/40 px-4 py-3">
      <div className="text-2xs uppercase tracking-[0.14em] text-subtle">{label}</div>
      <div className="tabular mt-1.5 flex items-baseline gap-1.5 font-mono text-lg font-medium text-text">
        <span>{value}</span>
        {suffix && (
          <span className="text-2xs uppercase tracking-[0.14em] text-muted">{suffix}</span>
        )}
      </div>
    </div>
  );
}

function computeDelta(series: MidPoint[], current: number | undefined): number | null {
  if (!current || series.length < 2) return null;
  // Find the earliest point ≥ 24h ago.
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const earlier = [...series].reverse().find((p) => new Date(p.t).getTime() <= cutoff)
    ?? series[0];
  if (!earlier) return null;
  return ((current - earlier.rate) / earlier.rate) * 100;
}

function computeRange(series: MidPoint[]): { min: number; max: number } | null {
  if (series.length === 0) return null;
  const rates = series.map((s) => s.rate);
  return { min: Math.min(...rates), max: Math.max(...rates) };
}

function formatRate(n: number): string {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

function formatAmount(n: number): string {
  return n.toLocaleString('en-US');
}

function freshnessTone(iso: string): 'ok' | 'warn' | 'bad' | 'idle' {
  const ageMin = (Date.now() - new Date(iso).getTime()) / 60000;
  if (ageMin < 75) return 'ok';
  if (ageMin < 6 * 60) return 'warn';
  return 'bad';
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
