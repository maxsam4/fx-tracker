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
    return (
      <div className="py-16 text-center text-sm text-muted">
        No data in this window yet.
      </div>
    );
  }
  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={merged} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid
            stroke="rgb(36, 40, 47)"
            strokeDasharray="2 4"
            vertical={false}
          />
          <XAxis
            dataKey="tLabel"
            stroke="rgb(90, 94, 102)"
            tick={{ fontSize: 10, fontFamily: 'var(--font-mono)' }}
            tickLine={false}
            axisLine={{ stroke: 'rgb(32, 35, 41)' }}
            minTickGap={48}
          />
          <YAxis
            stroke="rgb(90, 94, 102)"
            domain={['auto', 'auto']}
            tick={{ fontSize: 10, fontFamily: 'var(--font-mono)' }}
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={(v: number) => v.toFixed(3)}
          />
          <Tooltip
            cursor={{ stroke: 'rgb(50, 54, 62)', strokeDasharray: '2 4' }}
            contentStyle={{
              background: 'rgb(14, 15, 17)',
              border: '1px solid rgb(50, 54, 62)',
              borderRadius: 6,
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              padding: '8px 10px',
            }}
            labelStyle={{ color: 'rgb(148, 152, 161)', marginBottom: 4 }}
            itemStyle={{ color: 'rgb(234, 234, 236)' }}
            formatter={(value: number) => value.toFixed(4)}
          />
          <Legend
            wrapperStyle={{
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              paddingTop: 8,
            }}
            iconType="plainline"
            iconSize={16}
          />
          <Line
            type="monotone"
            dataKey="provider"
            name={providerLabel}
            stroke="rgb(124, 212, 182)"
            strokeWidth={1.75}
            dot={false}
            activeDot={{ r: 3, strokeWidth: 0, fill: 'rgb(124, 212, 182)' }}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="mid"
            name="Mid-market"
            stroke="rgb(154, 163, 173)"
            strokeDasharray="3 3"
            strokeWidth={1}
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
