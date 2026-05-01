'use client';
import useSWR from 'swr';
import type { CurrencyPair } from '@fx/core';
import { MidMarketChart } from './MidMarketChart';
import { ProviderTable } from './ProviderTable';
import { WindowControls } from './WindowControls';
import { AmountControls } from './AmountControls';

interface MidPoint { t: string; rate: number; sources: string[]; }
interface RefPoint { t: string; rate: number; sourceId: string; }
interface TableRow {
  providerId: string;
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
  referenceAmounts: number[];
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
  const swrKey = `/api/rates/${encodeURIComponent(initial.pairKey)}?amount=${initial.sendAmount}&window=${initial.windowMs}`;
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {initial.pair.from}→{initial.pair.to}
          </h1>
          <div className="mt-1 text-sm text-muted">
            Mid-market{' '}
            <span className="font-mono text-text">
              {mid ? mid.rate.toFixed(4) : '—'}
            </span>
            {mid && (
              <span className="ml-2">
                · sources {mid.sources.join(', ')} · {timeAgo(mid.capturedAt)}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <AmountControls
            pairKey={initial.pairKey}
            current={initial.sendAmount}
            options={initial.referenceAmounts}
            from={initial.pair.from}
          />
          <WindowControls pairKey={initial.pairKey} currentMs={initial.windowMs} />
        </div>
      </div>

      <section className="rounded-md border border-edge bg-surface p-4">
        <h2 className="mb-3 text-sm font-medium text-muted">Mid-market &amp; references</h2>
        <MidMarketChart midSeries={midSeries} refSeries={refSeries} />
      </section>

      <section className="rounded-md border border-edge bg-surface p-4">
        <h2 className="mb-3 text-sm font-medium text-muted">
          Latest provider quotes — sending {initial.sendAmount} {initial.pair.from}
        </h2>
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
      </section>
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
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
