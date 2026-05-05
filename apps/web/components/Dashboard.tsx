'use client';
import useSWR from 'swr';
import type { CurrencyPair } from '@fx/core';
import { MidMarketChart } from './MidMarketChart';
import { ProviderTable } from './ProviderTable';
import { WindowControls } from './WindowControls';
import { Card } from './ui/Card';
import { StatusDot } from './ui/Pill';

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
  const freshnessLabel =
    freshness === 'ok' ? 'live' : freshness === 'warn' ? 'delayed' : freshness === 'bad' ? 'stale' : 'no data';

  const bestProvider = table.length ? [...table].sort((a, b) => b.effectiveRate - a.effectiveRate)[0] : null;
  const bestSpread = bestProvider && mid ? ((bestProvider.effectiveRate - mid.rate) / mid.rate) * 100 : null;

  const rateString = mid ? formatRate(mid.rate) : null;

  return (
    <div className="stagger space-y-5">
      {/* HERO — single horizontal band, dense */}
      <section className="relative overflow-hidden rounded-xl border border-edge rate-ribbon">
        <div className="pointer-events-none absolute inset-0 paper-grain opacity-30" aria-hidden />
        <div className="relative grid grid-cols-1 items-stretch divide-y divide-edge/60 lg:grid-cols-[auto_1fr_auto] lg:divide-x lg:divide-y-0">
          {/* Pair + rate */}
          <div className="flex flex-col gap-2 px-6 py-5">
            <div className="flex items-center gap-2 font-sans text-2xs font-medium uppercase tracking-[0.22em] text-subtle">
              <span className="tabular text-muted">{initial.pair.from}</span>
              <span className="text-subtle">→</span>
              <span className="tabular text-text">{initial.pair.to}</span>
              <span className="mx-1 h-3 w-px bg-edge-strong" aria-hidden />
              <span>Mid-market median</span>
            </div>
            <div className="flex items-baseline gap-3">
              <span className="rate-display text-[clamp(3rem,5.5vw,4.75rem)] text-text">
                {rateString ?? '—'}
              </span>
              {delta24h !== null && <DeltaTag value={delta24h} />}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-sans text-2xs text-muted">
              <span className="inline-flex items-center gap-1.5">
                <StatusDot status={freshness} />
                <span className="font-medium uppercase tracking-[0.16em]">{freshnessLabel}</span>
                {mid && <span className="tabular text-subtle">· {timeAgo(mid.capturedAt)}</span>}
              </span>
              {mid && mid.sources.length > 0 && (
                <span className="text-subtle">
                  · {mid.sources.length}-source median ({mid.sources.slice(0, 4).join(', ')}
                  {mid.sources.length > 4 ? `, +${mid.sources.length - 4}` : ''})
                </span>
              )}
            </div>
          </div>

          {/* Sparkline center band — fills remaining width */}
          <div className="relative px-6 py-4">
            <HeroSparkline
              points={midSeries}
              tone={delta24h === null ? 'neutral' : delta24h >= 0 ? 'positive' : 'negative'}
            />
          </div>

          {/* Inline meta — 4 stats in a horizontal strip */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 px-6 py-5 sm:grid-cols-4 lg:grid-cols-2 lg:gap-x-8">
            <Stat label="High" value={range ? formatRate(range.max) : '—'} />
            <Stat label="Low" value={range ? formatRate(range.min) : '—'} />
            <Stat
              label="Best"
              value={bestProvider ? PROVIDER_LABELS[bestProvider.providerId] ?? bestProvider.providerId : '—'}
              hint={bestSpread !== null ? `${bestSpread >= 0 ? '+' : ''}${bestSpread.toFixed(2)}%` : undefined}
              tone={bestSpread !== null && bestSpread >= 0 ? 'accent' : 'neutral'}
            />
            <Stat
              label="Tracked"
              value={`${initial.configuredProviders.length}p · ${refLatest.length}f`}
            />
          </div>
        </div>
      </section>

      {/* CONTROLS + CHART */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <h2 className="display text-base font-semibold leading-none text-text">
              Rate history
            </h2>
            <p className="font-sans text-xs text-muted">
              Median against each upstream feed
            </p>
          </div>
          <WindowControls pairKey={initial.pairKey} currentMs={initial.windowMs} />
        </div>
        <Card>
          <div className="px-2 pb-2 pt-3 md:px-3">
            <MidMarketChart midSeries={midSeries} refSeries={refSeries} />
          </div>
        </Card>
      </section>

      {/* PROVIDER TABLE */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <h2 className="display text-base font-semibold leading-none text-text">
              Provider quotes
            </h2>
            <p className="font-sans text-xs text-muted">
              Sending{' '}
              <span className="tabular font-medium text-text">
                {formatAmount(initial.sendAmount)} {initial.pair.from}
              </span>{' '}
              · effective rate · best first
            </p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-edge bg-surface/70 px-3 py-1 backdrop-blur">
            <span
              className="h-1.5 w-1.5 rounded-full bg-accent dot-glow-accent pulse-soft"
              aria-hidden
            />
            <span className="font-sans text-2xs font-medium uppercase tracking-[0.18em] text-muted">
              {table.length} live
            </span>
          </span>
        </div>
        <Card>
          <ProviderTable
            rows={table}
            refLatest={refLatest}
            runStatus={runStatus}
            configuredProviders={initial.configuredProviders}
            midRate={mid?.rate ?? null}
            midCapturedAt={mid?.capturedAt ?? null}
            fromCurrency={initial.pair.from}
            toCurrency={initial.pair.to}
            sendAmount={initial.sendAmount}
            pairKey={initial.pairKey}
          />
        </Card>
      </section>
    </div>
  );
}

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

function HeroSparkline({
  points,
  tone,
}: {
  points: MidPoint[];
  tone: 'neutral' | 'positive' | 'negative';
}) {
  if (points.length < 2) {
    return (
      <div className="flex h-[64px] items-center justify-start font-sans text-xs text-subtle">
        Awaiting data — first poll runs within the hour.
      </div>
    );
  }
  const ys = points.map((p) => p.rate);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const span = max - min || 1;
  const W = 600;
  const H = 64;
  const stepX = W / (points.length - 1);

  const coords = points.map((p, i) => {
    const x = i * stepX;
    const y = H - ((p.rate - min) / span) * (H - 6) - 3;
    return [x, y] as const;
  });
  const path = coords
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(' ');
  const area = `${path} L${(coords.at(-1)?.[0] ?? 0).toFixed(2)},${H} L0,${H} Z`;

  const stroke =
    tone === 'positive'
      ? 'rgb(var(--accent))'
      : tone === 'negative'
        ? 'rgb(var(--bad))'
        : 'rgb(var(--muted))';

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-[64px] w-full"
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id="hero-spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={0.32} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#hero-spark)" stroke="none" />
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={coords.at(-1)?.[0] ?? 0}
        cy={coords.at(-1)?.[1] ?? 0}
        r={3.5}
        fill={stroke}
      />
      <circle
        cx={coords.at(-1)?.[0] ?? 0}
        cy={coords.at(-1)?.[1] ?? 0}
        r={7}
        fill={stroke}
        fillOpacity={0.18}
      />
    </svg>
  );
}

function DeltaTag({ value }: { value: number }) {
  const positive = value > 0.005;
  const negative = value < -0.005;
  const tone = positive
    ? 'border-accent/40 bg-accent/12 text-accent'
    : negative
      ? 'border-bad/40 bg-bad/12 text-bad'
      : 'border-edge bg-surface text-muted';
  return (
    <span
      className={`tabular inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-sans text-2xs font-medium ${tone}`}
    >
      <span aria-hidden className="text-[9px]">
        {positive ? '↑' : negative ? '↓' : '◆'}
      </span>
      {value > 0 ? '+' : ''}
      {value.toFixed(2)}%
      <span className="opacity-70">24h</span>
    </span>
  );
}

function Stat({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'neutral' | 'accent';
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-sans text-[10px] font-medium uppercase tracking-[0.18em] text-subtle">
        {label}
      </span>
      <div className="flex items-baseline gap-1.5">
        <span
          className={`tabular truncate font-sans text-base font-semibold leading-tight ${
            tone === 'accent' ? 'text-accent' : 'text-text'
          }`}
        >
          {value}
        </span>
        {hint && (
          <span
            className={`tabular shrink-0 font-sans text-2xs font-medium ${
              tone === 'accent' ? 'text-accent' : 'text-muted'
            }`}
          >
            {hint}
          </span>
        )}
      </div>
    </div>
  );
}

function computeDelta(series: MidPoint[], current: number | undefined): number | null {
  if (!current || series.length < 2) return null;
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const earlier =
    [...series].reverse().find((p) => new Date(p.t).getTime() <= cutoff) ?? series[0];
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
