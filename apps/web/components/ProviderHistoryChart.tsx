'use client';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
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
      <div className="flex h-[420px] items-center justify-center font-sans text-sm text-muted">
        No data in this window yet.
      </div>
    );
  }
  return (
    <div className="h-[420px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={merged} margin={{ top: 24, right: 32, left: 8, bottom: 8 }}>
          <defs>
            <linearGradient id="providerFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(92, 200, 156)" stopOpacity={0.30} />
              <stop offset="100%" stopColor="rgb(92, 200, 156)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            stroke="rgb(36, 40, 50)"
            strokeOpacity={0.4}
            vertical={false}
          />
          <XAxis
            dataKey="tLabel"
            stroke="rgb(110, 108, 102)"
            tick={{
              fontSize: 11,
              fontFamily: 'var(--font-sans)',
              fill: 'rgb(110, 108, 102)',
            }}
            tickLine={false}
            axisLine={false}
            minTickGap={64}
            dy={10}
          />
          <YAxis
            stroke="rgb(110, 108, 102)"
            domain={['auto', 'auto']}
            tick={{
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              fill: 'rgb(110, 108, 102)',
            }}
            tickLine={false}
            axisLine={false}
            width={64}
            orientation="right"
            tickFormatter={(v: number) => v.toFixed(3)}
          />
          <Tooltip
            cursor={{ stroke: 'rgb(56, 62, 76)', strokeWidth: 1, strokeDasharray: '3 3' }}
            contentStyle={{
              background: 'rgb(18, 20, 26)',
              border: '1px solid rgb(36, 40, 50)',
              borderRadius: 12,
              fontFamily: 'var(--font-sans)',
              fontSize: 12,
              padding: '10px 12px',
              boxShadow: '0 24px 48px -24px rgb(0 0 0 / 0.5)',
            }}
            labelStyle={{
              color: 'rgb(110, 108, 102)',
              marginBottom: 6,
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '0.16em',
            }}
            itemStyle={{ color: 'rgb(240, 235, 224)', fontFamily: 'var(--font-mono)' }}
            formatter={(value: number) => value.toFixed(4)}
          />
          <Legend
            wrapperStyle={{
              fontSize: 11,
              fontFamily: 'var(--font-sans)',
              paddingTop: 16,
            }}
            iconType="plainline"
            iconSize={20}
          />
          <Area
            type="monotone"
            dataKey="provider"
            name={providerLabel}
            stroke="rgb(92, 200, 156)"
            strokeWidth={2.5}
            fill="url(#providerFill)"
            activeDot={{
              r: 5,
              strokeWidth: 2,
              stroke: 'rgb(18, 20, 26)',
              fill: 'rgb(92, 200, 156)',
            }}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="mid"
            name="Mid-market"
            stroke="rgb(165, 162, 152)"
            strokeDasharray="3 4"
            strokeWidth={1.25}
            dot={false}
            isAnimationActive={false}
            opacity={0.7}
          />
        </ComposedChart>
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
