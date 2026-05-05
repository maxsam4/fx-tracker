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
  fromCurrency,
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
    'tabular rounded-md border border-edge bg-elevated px-2 py-1 font-mono text-xs text-text transition-colors hover:border-edge-strong focus:border-accent focus:outline-none';

  return (
    <tr className="border-b border-edge/40 bg-surface/30">
      <td className="px-7 py-5">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-dashed border-edge-strong font-sans text-2xs uppercase tracking-[0.14em] text-subtle">
          ƒ
        </span>
      </td>
      <td className="px-2 py-5">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-sans text-base font-medium text-text">Derived path</span>
            <Pill tone="muted">USD bridge</Pill>
          </div>
          <div className="flex flex-wrap items-center gap-2 font-sans text-2xs text-subtle">
            <span className="uppercase tracking-[0.14em]">USD-INR</span>
            <select
              value={selUsdInr}
              onChange={(e) => setSelUsdInr(e.target.value)}
              className={selectClass}
              aria-label={`USD to ${toCurrency} rate`}
            >
              {usdInrMid !== null && (
                <option value="mid">mid ({usdInrMid.toFixed(4)})</option>
              )}
              <option value="best">
                best{bestUsdInr !== null ? ` (${bestUsdInr.toFixed(4)})` : ''}
              </option>
              {usdInrRates.map((r) => (
                <option key={r.providerId} value={String(r.effectiveRate)}>
                  {r.providerId} ({r.effectiveRate.toFixed(4)})
                </option>
              ))}
            </select>
            <span className="text-subtle">÷</span>
            <span className="uppercase tracking-[0.14em]">USD-AED</span>
            <select
              value={selUsdAed}
              onChange={(e) => setSelUsdAed(e.target.value)}
              className={selectClass}
              aria-label={`USD to ${fromCurrency} rate`}
            >
              {USD_AED_PRESETS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>
      </td>
      <td className="px-3 py-5 text-right">
        <span
          className={`tabular block font-mono text-lg font-medium ${
            rate === null ? 'text-subtle' : 'text-text'
          }`}
        >
          {rate !== null ? rate.toFixed(4) : '—'}
        </span>
        <span className="font-sans text-2xs uppercase tracking-[0.16em] text-subtle">
          {toCurrency} / {fromCurrency}
        </span>
      </td>
      <td className="px-3 py-5">
        {delta === null ? (
          <span className="font-sans text-xs text-subtle">—</span>
        ) : (
          <span className={`tabular font-sans text-sm font-medium ${deltaTone}`}>
            {delta >= 0 ? '+' : ''}
            {delta.toFixed(2)}%
          </span>
        )}
      </td>
      <td className="px-3 py-5 text-right">
        <span
          className={`tabular block font-mono text-base ${
            receiveAmount === null ? 'text-subtle' : 'text-text font-medium'
          }`}
        >
          {receiveAmount !== null ? fmt(receiveAmount) : '—'}
        </span>
        <span className="font-sans text-2xs uppercase tracking-[0.16em] text-subtle">
          {toCurrency}
        </span>
      </td>
      <td className="px-3 py-5 text-right">
        <span className="font-sans text-xs text-subtle">—</span>
      </td>
      <td className="px-7 py-5 text-right font-sans text-2xs uppercase tracking-[0.16em] text-subtle">
        manual
      </td>
    </tr>
  );
}

const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });
