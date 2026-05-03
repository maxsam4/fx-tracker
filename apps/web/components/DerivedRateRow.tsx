'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { Pill } from './ui/Pill';

// Lets the user explore "what AED-INR rate would I get if I converted via
// USD?" — for example by holding USD in a Wise account, then pulling AED
// at one of the typical UAE bank pegs (~3.6725 ± 0.0005). The synthetic
// rate is `USD-INR ÷ USD-AED`. Both inputs are user-selectable; the row
// re-renders the result on each change.
//
// Only rendered for the AED-INR pair (gated in ProviderTable).

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// AED is pegged to USD at ~3.6725. Real banks/fintechs charge a small
// spread around the peg; these four are the typical wholesale + retail
// brackets we see for AED-USD purchases in the UAE.
const USD_AED_PRESETS = ['3.67250', '3.67275', '3.67300', '3.67325'];

interface UsdInrRow {
  providerId: string;
  effectiveRate: number;
}

interface ApiResponse {
  table?: UsdInrRow[];
  mid?: { rate: number } | null;
}

export function DerivedRateRow({
  sendAmount,
  fromCurrency,
  toCurrency,
  midRate,
}: {
  sendAmount: number;
  fromCurrency: string; // AED
  toCurrency: string; // INR
  midRate: number | null;
}) {
  // Pull USD-INR rates fresh; refresh in lockstep with the dashboard's
  // 60s SWR cadence so a freshly-polled provider rate flows through.
  const { data } = useSWR<ApiResponse>('/api/rates/USD-INR', fetcher, {
    refreshInterval: 60_000,
  });

  const usdInrRates = (data?.table ?? []).filter(
    (r) => Number.isFinite(r.effectiveRate) && r.effectiveRate > 0,
  );
  const usdInrMid = data?.mid?.rate ?? null;
  const bestUsdInr = usdInrRates.length > 0
    ? Math.max(...usdInrRates.map((r) => r.effectiveRate))
    : null;

  const [selUsdInr, setSelUsdInr] = useState<string>('mid');
  const [customUsdInr, setCustomUsdInr] = useState<string>('');
  const [selUsdAed, setSelUsdAed] = useState<string>('3.67250');
  const [customUsdAed, setCustomUsdAed] = useState<string>('');

  // Resolve the selected dropdown value to a number (or null if invalid).
  let usdInrValue: number | null = null;
  if (selUsdInr === 'best') {
    usdInrValue = bestUsdInr;
  } else if (selUsdInr === 'mid') {
    usdInrValue = usdInrMid;
  } else if (selUsdInr === 'custom') {
    const n = parseFloat(customUsdInr);
    usdInrValue = Number.isFinite(n) && n > 0 ? n : null;
  } else {
    const n = parseFloat(selUsdInr);
    usdInrValue = Number.isFinite(n) && n > 0 ? n : null;
  }

  let usdAedValue: number | null = null;
  if (selUsdAed === 'custom') {
    const n = parseFloat(customUsdAed);
    usdAedValue = Number.isFinite(n) && n > 0 ? n : null;
  } else {
    const n = parseFloat(selUsdAed);
    usdAedValue = Number.isFinite(n) && n > 0 ? n : null;
  }

  const aedInrRate =
    usdInrValue !== null && usdAedValue !== null && usdAedValue > 0
      ? usdInrValue / usdAedValue
      : null;
  const receive = aedInrRate !== null ? sendAmount * aedInrRate : null;
  const delta =
    aedInrRate !== null && midRate ? ((aedInrRate - midRate) / midRate) * 100 : null;
  const deltaTone =
    delta === null
      ? 'text-subtle'
      : delta >= -0.5
        ? 'text-accent'
        : delta >= -2
          ? 'text-warn'
          : 'text-bad';

  const selectClass =
    'rounded border border-edge bg-surface px-1.5 py-0.5 font-mono text-2xs text-text focus:border-accent focus:outline-none';
  const inputClass =
    'w-20 rounded border border-edge bg-surface px-1.5 py-0.5 font-mono text-2xs text-text focus:border-accent focus:outline-none';

  return (
    <tr className="border-b border-edge/60 bg-bg/30">
      <td className="px-5 py-3.5">
        <span className="tabular font-mono text-2xs text-subtle">—</span>
      </td>
      <td className="px-3 py-3.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <span className="font-mono text-sm font-medium text-text">derived</span>
          <Pill tone="muted">USD→{toCurrency} ÷ USD→{fromCurrency}</Pill>
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
            <option value="custom">custom…</option>
          </select>
          {selUsdInr === 'custom' && (
            <input
              type="number"
              step="0.0001"
              inputMode="decimal"
              value={customUsdInr}
              onChange={(e) => setCustomUsdInr(e.target.value)}
              placeholder="94.65"
              className={inputClass}
              aria-label={`Custom USD to ${toCurrency} rate`}
            />
          )}
          <span className="font-mono text-2xs text-subtle">÷</span>
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
            <option value="custom">custom…</option>
          </select>
          {selUsdAed === 'custom' && (
            <input
              type="number"
              step="0.0001"
              inputMode="decimal"
              value={customUsdAed}
              onChange={(e) => setCustomUsdAed(e.target.value)}
              placeholder="3.67250"
              className={inputClass}
              aria-label={`Custom USD to ${fromCurrency} rate`}
            />
          )}
        </div>
      </td>
      <td
        className={`tabular px-3 py-3.5 text-right font-mono text-sm ${
          aedInrRate === null ? 'text-subtle' : 'text-muted'
        }`}
      >
        {aedInrRate !== null ? aedInrRate.toFixed(4) : '—'}
      </td>
      <td className="px-3 py-3.5 text-right">
        <span
          className={`tabular font-mono text-sm font-medium ${
            aedInrRate === null ? 'text-subtle' : 'text-text'
          }`}
        >
          {aedInrRate !== null ? aedInrRate.toFixed(4) : '—'}
        </span>
      </td>
      <td className="px-3 py-3.5">
        {delta === null ? (
          <span className="text-subtle">—</span>
        ) : (
          <span className={`tabular font-mono text-xs font-medium ${deltaTone}`}>
            {delta >= 0 ? '+' : ''}
            {delta.toFixed(2)}%
          </span>
        )}
      </td>
      <td
        className={`tabular px-3 py-3.5 text-right font-mono text-sm ${
          receive === null ? 'text-subtle' : 'text-text'
        }`}
      >
        {receive !== null ? fmt(receive) : '—'}
      </td>
      <td className="px-3 py-3.5 text-right text-sm text-subtle">—</td>
      <td className="px-5 py-3.5 text-right text-2xs uppercase tracking-[0.12em] text-subtle">
        manual
      </td>
    </tr>
  );
}

const fmt = (n: number) =>
  n.toLocaleString('en-US', { maximumFractionDigits: 2 });
