'use client';
import type { Dispatch, SetStateAction } from 'react';
import { Pill } from './ui/Pill';

interface UsdInrRow {
  providerId: string;
  effectiveRate: number;
}

export const USD_AED_PRESETS = ['3.67250', '3.67275', '3.67300', '3.67325'];

export function DerivedRateRow({
  rate,
  receiveAmount,
  delta,
  fromCurrency: _fromCurrency,
  toCurrency,
  selUsdInr,
  setSelUsdInr,
  selUsdAed,
  setSelUsdAed,
  usdInrMid,
  bestUsdInr,
  usdInrRates,
}: {
  rate: number | null;
  receiveAmount: number | null;
  delta: number | null;
  fromCurrency: string;
  toCurrency: string;
  selUsdInr: string;
  setSelUsdInr: Dispatch<SetStateAction<string>>;
  selUsdAed: string;
  setSelUsdAed: Dispatch<SetStateAction<string>>;
  usdInrMid: number | null;
  bestUsdInr: number | null;
  usdInrRates: UsdInrRow[];
}) {
  const deltaTone =
    delta === null
      ? 'text-subtle'
      : delta >= -0.5
        ? 'text-accent'
        : delta >= -2
          ? 'text-warn'
          : 'text-bad';

  const selectClass =
    'tabular rounded-md border border-edge bg-elevated px-1.5 py-0.5 font-mono text-[11px] text-text transition-colors hover:border-edge-strong focus:border-accent focus:outline-none';

  return (
    <tr className="h-9 border-b border-edge/40 bg-surface/30">
      <td className="px-3">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-edge-strong font-mono text-[11px] text-subtle">
          ƒ
        </span>
      </td>
      <td className="px-2">
        <div className="flex items-center gap-1.5">
          <span className="font-sans text-sm font-semibold text-text">Derived</span>
          <Pill tone="muted">USD bridge</Pill>
        </div>
      </td>
      <td className="hidden px-2 md:table-cell">
        <div className="flex items-center gap-1 text-[10px] text-subtle">
          <select
            value={selUsdInr}
            onChange={(e) => setSelUsdInr(e.target.value)}
            className={selectClass}
            aria-label={`USD to ${toCurrency} rate`}
          >
            {usdInrMid !== null && (
              <option value="mid">mid {usdInrMid.toFixed(4)}</option>
            )}
            <option value="best">
              best{bestUsdInr !== null ? ` ${bestUsdInr.toFixed(4)}` : ''}
            </option>
            {usdInrRates.map((r) => (
              <option key={r.providerId} value={String(r.effectiveRate)}>
                {r.providerId} {r.effectiveRate.toFixed(4)}
              </option>
            ))}
          </select>
          <span className="text-subtle">÷</span>
          <select
            value={selUsdAed}
            onChange={(e) => setSelUsdAed(e.target.value)}
            className={selectClass}
            aria-label="USD to AED peg"
          >
            {USD_AED_PRESETS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </td>
      <td
        className={`tabular px-2 text-right font-mono text-[13px] ${
          rate === null ? 'text-subtle' : 'text-subtle'
        }`}
      >
        {rate !== null ? rate.toFixed(4) : '—'}
      </td>
      <td className="px-2 text-right">
        <span
          className={`tabular font-mono text-[14px] font-semibold ${
            rate === null ? 'text-subtle' : 'text-text'
          }`}
        >
          {rate !== null ? rate.toFixed(4) : '—'}
        </span>
      </td>
      <td className="px-2">
        {delta === null ? (
          <span className="font-sans text-[11px] text-subtle">—</span>
        ) : (
          <span className={`tabular font-sans text-[12px] font-semibold ${deltaTone}`}>
            {delta >= 0 ? '+' : ''}
            {delta.toFixed(2)}%
          </span>
        )}
      </td>
      <td className="px-2 text-right">
        <span
          className={`tabular font-mono text-[13px] ${
            receiveAmount === null ? 'text-subtle' : 'text-text font-semibold'
          }`}
        >
          {receiveAmount !== null ? fmt(receiveAmount) : '—'}
        </span>
      </td>
      <td className="hidden px-2 text-right sm:table-cell">
        <span className="font-sans text-[11px] text-subtle">—</span>
      </td>
      <td className="px-3 text-right font-sans text-[10px] uppercase tracking-[0.14em] text-subtle">
        manual
      </td>
    </tr>
  );
}

const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });
