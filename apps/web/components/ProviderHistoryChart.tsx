'use client';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

interface ProviderPoint { t: string; rate: number; rawRate: number; }
interface MidPoint { t: string; rate: number; }

export function ProviderHistoryChart({
  providerSeries,
  midSeries,
  providerLabel,
}: {
  providerSeries: ProviderPoint[];
  midSeries: MidPoint[];
  providerLabel: string;
}) {
  const merged = mergeSeries(providerSeries, midSeries);
  if (merged.length === 0) {
    return <div className="py-8 text-center text-muted">No data in this window yet.</div>;
  }
  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={merged} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#1f242b" strokeDasharray="3 3" />
          <XAxis dataKey="tLabel" stroke="#7a8693" tick={{ fontSize: 11 }} />
          <YAxis
            stroke="#7a8693"
            domain={['auto', 'auto']}
            tick={{ fontSize: 11 }}
            width={70}
          />
          <Tooltip
            contentStyle={{ background: '#13171c', border: '1px solid #1f242b' }}
            labelStyle={{ color: '#e7ebf0' }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey="provider"
            name={providerLabel}
            stroke="#7cd4b6"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="mid"
            name="Mid-market"
            stroke="#7a8693"
            strokeDasharray="4 3"
            strokeWidth={1.4}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function mergeSeries(provider: ProviderPoint[], mid: MidPoint[]) {
  const byTime = new Map<string, Record<string, number | string>>();
  for (const p of provider) {
    const k = bucket(p.t);
    const slot = byTime.get(k) ?? { tLabel: formatLabel(p.t) };
    slot.provider = p.rate;
    byTime.set(k, slot);
  }
  for (const m of mid) {
    const k = bucket(m.t);
    const slot = byTime.get(k) ?? { tLabel: formatLabel(m.t) };
    slot.mid = m.rate;
    byTime.set(k, slot);
  }
  return Array.from(byTime.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v);
}

function bucket(iso: string): string {
  const d = new Date(iso);
  d.setMinutes(Math.floor(d.getMinutes() / 5) * 5, 0, 0);
  return d.toISOString();
}

function formatLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
