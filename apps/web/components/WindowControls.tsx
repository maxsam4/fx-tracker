'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

const OPTIONS: Array<{ key: string; label: string; ms: number }> = [
  { key: '24h', label: '24h', ms: 24 * 60 * 60 * 1000 },
  { key: '7d', label: '7d', ms: 7 * 24 * 60 * 60 * 1000 },
  { key: '30d', label: '30d', ms: 30 * 24 * 60 * 60 * 1000 },
  { key: '90d', label: '90d', ms: 90 * 24 * 60 * 60 * 1000 },
  { key: '1y', label: '1y', ms: 365 * 24 * 60 * 60 * 1000 },
  { key: 'all', label: 'all', ms: 10 * 365 * 24 * 60 * 60 * 1000 },
];

export function WindowControls({
  pairKey,
  currentMs,
}: {
  pairKey: string;
  currentMs: number;
}) {
  const params = useSearchParams();
  const amount = params.get('amount');

  return (
    <div className="flex gap-1 rounded-md border border-edge bg-surface p-1">
      {OPTIONS.map((o) => {
        const active = Math.abs(currentMs - o.ms) < 1000;
        const sp = new URLSearchParams();
        sp.set('window', o.key);
        if (amount) sp.set('amount', amount);
        return (
          <Link
            key={o.key}
            href={`/${pairKey}?${sp.toString()}`}
            className={`rounded px-2 py-1 text-xs ${
              active ? 'bg-edge text-text' : 'text-muted hover:text-text'
            }`}
          >
            {o.label}
          </Link>
        );
      })}
    </div>
  );
}
