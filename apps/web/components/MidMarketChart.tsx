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

interface MidPoint { t: string; rate: number; }
interface RefPoint { t: string; rate: number; sourceId: string; }

export function MidMarketChart({
  midSeries,
  refSeries,
}: {
  midSeries: MidPoint[];
  refSeries: RefPoint[];
}) {
  // Pivot reference rates per source onto the same time axis.
  const merged = mergeSeries(midSeries, refSeries);
  const sources = Array.from(new Set(refSeries.map((r) => r.sourceId)));

  if (merged.length === 0) {
    return <div className="py-8 text-center text-muted">No data in this window yet.</div>;
  }

  return (
    <div className="h-72 w-full">
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
            dataKey="mid"
            name="Mid-market"
            stroke="#7cd4b6"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          {sources.map((s) => (
            <Line
              key={s}
              type="monotone"
              dataKey={`ref:${s}`}
              name={s}
              stroke="#7a8693"
              strokeDasharray="4 3"
              strokeWidth={1.4}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function mergeSeries(mid: MidPoint[], ref: RefPoint[]) {
  const byTime = new Map<string, Record<string, number | string>>();
  for (const m of mid) {
    const k = bucket(m.t);
    const slot = byTime.get(k) ?? { tLabel: formatLabel(m.t) };
    slot.mid = m.rate;
    byTime.set(k, slot);
  }
  for (const r of ref) {
    const k = bucket(r.t);
    const slot = byTime.get(k) ?? { tLabel: formatLabel(r.t) };
    slot[`ref:${r.sourceId}`] = r.rate;
    byTime.set(k, slot);
  }
  return Array.from(byTime.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v);
}

function bucket(iso: string): string {
  // Round down to the nearest 5 minutes so ref + mid samples align even when
  // captured a few seconds apart.
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
