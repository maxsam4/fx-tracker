'use client';

interface Row {
  providerId: string;
  capturedAt: string;
  sendAmount: number;
  receiveAmount: number;
  effectiveRate: number;
  feeAmount: number;
  rate: number;
}

export function ProviderTable({
  rows,
  midRate,
  fromCurrency,
  toCurrency,
}: {
  rows: Row[];
  midRate: number | null;
  fromCurrency: string;
  toCurrency: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="py-6 text-center text-muted">
        No provider quotes captured yet for this amount.
      </div>
    );
  }

  const sorted = [...rows].sort((a, b) => b.effectiveRate - a.effectiveRate);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-muted">
          <tr>
            <th className="px-2 py-2">Provider</th>
            <th className="px-2 py-2">Effective rate</th>
            <th className="px-2 py-2">Δ vs mid</th>
            <th className="px-2 py-2">Receive ({toCurrency})</th>
            <th className="px-2 py-2">Fee ({fromCurrency})</th>
            <th className="px-2 py-2">Updated</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => {
            const delta = midRate ? ((r.effectiveRate - midRate) / midRate) * 100 : null;
            const deltaClass =
              delta === null
                ? 'text-muted'
                : delta >= -0.5
                ? 'text-accent'
                : delta >= -2
                ? 'text-warn'
                : 'text-bad';
            return (
              <tr key={r.providerId} className={i === 0 ? 'bg-edge/30' : ''}>
                <td className="px-2 py-2 font-medium">{r.providerId}</td>
                <td className="px-2 py-2 font-mono">{r.effectiveRate.toFixed(4)}</td>
                <td className={`px-2 py-2 font-mono ${deltaClass}`}>
                  {delta === null ? '—' : `${delta >= 0 ? '+' : ''}${delta.toFixed(2)}%`}
                </td>
                <td className="px-2 py-2 font-mono">{fmt(r.receiveAmount)}</td>
                <td className="px-2 py-2 font-mono">{fmt(r.feeAmount)}</td>
                <td className="px-2 py-2 text-muted">{ago(r.capturedAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
