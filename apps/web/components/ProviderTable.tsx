'use client';
import Link from 'next/link';

interface Row {
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

interface UnifiedRow {
  kind: 'provider' | 'reference';
  id: string;
  capturedAt: string;
  sendAmount: number;
  receiveAmount: number | null;
  effectiveRate: number;
  rawRate: number;
  feeAmount: number | null;
}

export function ProviderTable({
  rows,
  refLatest,
  runStatus,
  configuredProviders,
  midRate,
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
  fromCurrency: string;
  toCurrency: string;
  sendAmount: number;
  pairKey: string;
}) {
  const providerRows: UnifiedRow[] = rows.map((r) => ({
    kind: 'provider',
    id: r.providerId,
    capturedAt: r.capturedAt,
    sendAmount: r.sendAmount,
    receiveAmount: r.receiveAmount,
    effectiveRate: r.effectiveRate,
    rawRate: r.rate,
    feeAmount: r.feeAmount,
  }));

  // Mid-market sources = rate-only (no fee). Effective rate equals raw rate.
  // Display alongside provider quotes so users can compare to the headline mid.
  const referenceRows: UnifiedRow[] = refLatest.map((r) => ({
    kind: 'reference',
    id: r.sourceId,
    capturedAt: r.capturedAt,
    sendAmount,
    receiveAmount: sendAmount * r.rate,
    effectiveRate: r.rate,
    rawRate: r.rate,
    feeAmount: null,
  }));

  const all = [...referenceRows, ...providerRows].sort(
    (a, b) => b.effectiveRate - a.effectiveRate,
  );

  // Configured providers that have NO recent quote — surface as a failure footer.
  const presentIds = new Set(rows.map((r) => r.providerId));
  const statusByProvider = new Map(runStatus.map((s) => [s.providerId, s] as const));
  const missing = configuredProviders.filter((p) => !presentIds.has(p));

  if (all.length === 0 && missing.length === 0) {
    return (
      <div className="py-6 text-center text-muted">
        No provider quotes captured yet for this amount.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-muted">
            <tr>
              <th className="px-2 py-2">Provider</th>
              <th className="px-2 py-2">Effective rate</th>
              <th className="px-2 py-2">Raw rate</th>
              <th className="px-2 py-2">Δ vs mid</th>
              <th className="px-2 py-2">Receive ({toCurrency})</th>
              <th className="px-2 py-2">Fee ({fromCurrency})</th>
              <th className="px-2 py-2">Updated</th>
            </tr>
          </thead>
          <tbody>
            {all.map((r, i) => {
              const delta = midRate ? ((r.effectiveRate - midRate) / midRate) * 100 : null;
              const deltaClass =
                delta === null
                  ? 'text-muted'
                  : delta >= -0.5
                  ? 'text-accent'
                  : delta >= -2
                  ? 'text-warn'
                  : 'text-bad';
              const isReference = r.kind === 'reference';
              const isBest = i === 0 && !isReference;

              const idCell = isReference ? (
                <span className="italic">{r.id}</span>
              ) : (
                <Link
                  href={`/${encodeURIComponent(pairKey)}/providers/${encodeURIComponent(r.id)}?amount=${sendAmount}`}
                  className="font-medium text-text hover:text-accent hover:underline"
                >
                  {r.id}
                </Link>
              );

              const rowClass = [
                isBest ? 'bg-edge/30' : '',
                isReference ? 'text-muted' : '',
              ]
                .filter(Boolean)
                .join(' ');

              return (
                <tr key={`${r.kind}:${r.id}`} className={rowClass}>
                  <td className="px-2 py-2">
                    {idCell}
                    {isReference && (
                      <span className="ml-2 rounded border border-edge px-1 text-[10px] uppercase tracking-wide text-muted">
                        mid
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 font-mono">{r.effectiveRate.toFixed(4)}</td>
                  <td className="px-2 py-2 font-mono">{r.rawRate.toFixed(4)}</td>
                  <td className={`px-2 py-2 font-mono ${deltaClass}`}>
                    {delta === null ? '—' : `${delta >= 0 ? '+' : ''}${delta.toFixed(2)}%`}
                  </td>
                  <td className="px-2 py-2 font-mono">
                    {r.receiveAmount === null ? '—' : fmt(r.receiveAmount)}
                  </td>
                  <td className="px-2 py-2 font-mono">
                    {r.feeAmount === null ? '—' : fmt(r.feeAmount)}
                  </td>
                  <td className="px-2 py-2 text-muted">{ago(r.capturedAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {missing.length > 0 && (
        <div className="rounded-md border border-edge bg-surface/60 p-3 text-xs">
          <div className="mb-2 font-medium text-muted">
            Configured but not reporting ({missing.length})
          </div>
          <ul className="space-y-1">
            {missing.map((id) => {
              const s = statusByProvider.get(id);
              return (
                <li key={id} className="flex flex-wrap gap-2">
                  <span className="font-mono text-text">{id}</span>
                  <span
                    className={
                      s?.status === 'ok'
                        ? 'text-accent'
                        : s?.status === 'timeout'
                        ? 'text-warn'
                        : s?.status
                        ? 'text-bad'
                        : 'text-muted'
                    }
                  >
                    {s?.status ?? 'no run'}
                  </span>
                  {s?.errorMessage && (
                    <span className="text-muted">— {truncate(s.errorMessage, 140)}</span>
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

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
