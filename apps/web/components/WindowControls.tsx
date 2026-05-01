'use client';
import { useSearchParams } from 'next/navigation';
import { SegmentedControl } from './ui/SegmentedControl';

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
    <SegmentedControl
      label="Range"
      options={OPTIONS.map((o) => {
        const sp = new URLSearchParams();
        sp.set('window', o.key);
        if (amount) sp.set('amount', amount);
        return {
          key: o.key,
          active: Math.abs(currentMs - o.ms) < 1000,
          href: `/${pairKey}?${sp.toString()}`,
          label: <span className="tabular font-mono">{o.label}</span>,
        };
      })}
    />
  );
}
