'use client';
import useSWR from 'swr';
import type { CurrencyPair } from '@fx/core';
import { MidMarketChart } from './MidMarketChart';
import { ProviderTable } from './ProviderTable';
import { WindowControls } from './WindowControls';
import { Card, CardHeader } from './ui/Card';
import { StatusDot } from './ui/Pill';
import { Sparkline } from './ui/Sparkline';

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

  // Best rate from provider table for the "best deal today" callout.
  const bestProvider = table.length ? [...table].sort((a, b) => b.effectiveRate - a.effectiveRate)[0] : null;
  const bestSpread = bestProvider && mid ? ((bestProvider.effectiveRate - mid.rate) / mid.rate) * 100 : null;

  // Split rate into integer + decimal so the decimals can be set softer for visual rhythm.
  const rateString = mid ? formatRate(mid.rate) : null;
  const [intPart, decPart] = rateString ? splitRate(rateString) : ['—', ''];

  return (
    <div className="stagger space-y-10">
      {/* HERO */}
      <section className="relative overflow-hidden rounded-2xl border border-edge rate-ribbon">
        <div className="pointer-events-none absolute inset-0 paper-grain opacity-40" aria-hidden />
        <div className="relative grid gap-10 px-8 pb-10 pt-9 md:grid-cols-[1.3fr_1fr] md:gap-14 md:px-12 md:pb-14 md:pt-12">
          {/* LEFT — pair, rate, sparkline */}
          <div className="flex flex-col justify-between gap-10">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-baseline gap-2">
                <span className="display-italic text-3xl font-light leading-none text-muted">
                  {initial.pair.from.toLowerCase()}
                </span>
                <span className="display text-2xl font-light leading-none text-subtle">→</span>
                <span className="display-italic text-3xl font-light leading-none text-text">
                  {initial.pair.to.toLowerCase()}
                </span>
              </div>
              <span className="mx-1 h-4 w-px bg-edge-strong" aria-hidden />
              <span className="font-sans text-2xs font-medium uppercase tracking-[0.22em] text-subtle">
                Mid-market median
              </span>
              <span className="ml-auto inline-flex items-center gap-2 rounded-full border border-edge bg-surface/60 px-3 py-1.5 backdrop-blur">
                <StatusDot status={freshness} />
                <span className="font-sans text-2xs font-medium uppercase tracking-[0.18em] text-muted">
                  {freshnessLabel}
                </span>
                {mid && (
                  <span className="tabular font-mono text-2xs text-subtle">
                    · {timeAgo(mid.capturedAt)}
                  </span>
                )}
              </span>
            </div>

            {/* RATE — the showpiece */}
            <div className="flex flex-col gap-5">
              <div className="flex items-baseline gap-3 leading-none">
                <span className="rate-display text-[clamp(4.5rem,12vw,8.5rem)] font-light text-text">
                  {intPart}
                </span>
                {decPart && (
                  <span className="rate-display text-[clamp(2.5rem,7vw,5rem)] font-light text-muted">
                    .{decPart}
                  </span>
                )}
                {delta24h !== null && (
                  <span className="ml-3 hidden md:inline-block">
                    <DeltaTag value={delta24h} />
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 font-sans text-sm">
                <span className="font-medium text-muted">
                  <span className="tabular text-text">1 {initial.pair.from}</span>{' '}
                  <span className="text-subtle">·</span>{' '}
                  <span className="tabular text-text">{rateString} {initial.pair.to}</span>
                </span>
                {delta24h !== null && (
                  <span className="md:hidden">
                    <DeltaTag value={delta24h} />
                  </span>
                )}
                {mid && mid.sources.length > 0 && (
                  <span className="font-sans text-2xs uppercase tracking-[0.16em] text-subtle">
                    {mid.sources.length}-source median
                  </span>
                )}
              </div>
            </div>

            {/* SPARKLINE — large, beautiful */}
            <HeroSparkline
              points={midSeries}
              tone={delta24h === null ? 'neutral' : delta24h >= 0 ? 'positive' : 'negative'}
            />
          </div>

          {/* RIGHT — meta tiles */}
          <div className="grid grid-cols-2 gap-4 self-end md:gap-5">
            <MetaTile
              label="Window high"
              value={range ? formatRate(range.max) : '—'}
              hint={range ? '24h ↗ peak' : undefined}
            />
            <MetaTile
              label="Window low"
              value={range ? formatRate(range.min) : '—'}
              hint={range ? '24h ↘ trough' : undefined}
            />
            <MetaTile
              label="Best provider"
              value={bestProvider ? bestProvider.providerId : '—'}
              hint={
                bestSpread !== null
                  ? `${bestSpread >= 0 ? '+' : ''}${bestSpread.toFixed(2)}% vs mid`
                  : undefined
              }
              tone={bestSpread !== null && bestSpread >= 0 ? 'accent' : 'neutral'}
            />
            <MetaTile
              label="Tracked"
              value={initial.configuredProviders.length}
              hint={`${refLatest.length} mid feeds`}
            />
          </div>
        </div>

        {/* Source ribbon */}
        {mid && mid.sources.length > 0 && (
          <div className="border-t border-edge/60 bg-bg/40 px-8 py-4 md:px-12">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <span className="font-sans text-2xs font-medium uppercase tracking-[0.22em] text-subtle">
                Median draws from
              </span>
              {mid.sources.map((s: string) => (
                <span
                  key={s}
                  className="inline-flex items-center gap-1.5 font-mono text-xs text-muted"
                >
                  <span className="h-1 w-1 rounded-full bg-accent/60" aria-hidden />
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* CONTROLS */}
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1.5">
          <h2 className="display text-3xl font-normal leading-tight text-text">
            Rate history
          </h2>
          <p className="font-sans text-sm text-muted">
            Live median against each upstream feed — a single line where they agree, divergence where they don&apos;t.
          </p>
        </div>
        <WindowControls pairKey={initial.pairKey} currentMs={initial.windowMs} />
      </section>

      {/* CHART */}
      <Card>
        <div className="px-2 pb-3 pt-1 md:px-4">
          <MidMarketChart midSeries={midSeries} refSeries={refSeries} />
        </div>
      </Card>

      {/* PROVIDER TABLE SECTION */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1.5">
            <h2 className="display text-3xl font-normal leading-tight text-text">
              Provider quotes
            </h2>
            <p className="font-sans text-sm text-muted">
              Sending{' '}
              <span className="tabular font-medium text-text">
                {formatAmount(initial.sendAmount)} {initial.pair.from}
              </span>{' '}
              · effective rate accounts for advertised fees · sorted best-first.
            </p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-edge bg-surface/70 px-4 py-2 backdrop-blur">
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

function HeroSparkline({
  points,
  tone,
}: {
  points: MidPoint[];
  tone: 'neutral' | 'positive' | 'negative';
}) {
  if (points.length < 2) {
    return (
      <div className="flex h-[88px] items-center justify-start font-sans text-sm text-subtle">
        Awaiting data — first poll runs within the hour.
      </div>
    );
  }
  const ys = points.map((p) => p.rate);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const span = max - min || 1;
  const W = 560;
  const H = 88;
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
      className="h-[88px] w-full"
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id="hero-spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#hero-spark)" stroke="none" />
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={coords.at(-1)?.[0] ?? 0}
        cy={coords.at(-1)?.[1] ?? 0}
        r={4}
        fill={stroke}
      />
      <circle
        cx={coords.at(-1)?.[0] ?? 0}
        cy={coords.at(-1)?.[1] ?? 0}
        r={9}
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
      className={`tabular inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-sans text-xs font-medium ${tone}`}
    >
      <span aria-hidden>{positive ? '↑' : negative ? '↓' : '◆'}</span>
      {value > 0 ? '+' : ''}
      {value.toFixed(2)}%
      <span className="text-2xs uppercase tracking-[0.18em] opacity-70">24h</span>
    </span>
  );
}

function MetaTile({
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
    <div
      className={`relative overflow-hidden rounded-xl border bg-surface/40 px-5 py-4 backdrop-blur ${
        tone === 'accent' ? 'border-accent/30' : 'border-edge'
      }`}
    >
      <div className="font-sans text-2xs font-medium uppercase tracking-[0.22em] text-subtle">
        {label}
      </div>
      <div
        className={`tabular mt-2 font-sans text-2xl font-medium ${
          tone === 'accent' ? 'text-accent' : 'text-text'
        }`}
      >
        {value}
      </div>
      {hint && (
        <div className="mt-1 font-sans text-2xs uppercase tracking-[0.16em] text-muted">
          {hint}
        </div>
      )}
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

function splitRate(s: string): [string, string] {
  const [int, dec = ''] = s.split('.');
  return [int ?? '—', dec];
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
