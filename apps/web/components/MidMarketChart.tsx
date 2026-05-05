'use client';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ComposedChart,
} from 'recharts';

interface MidPoint { t: string; rate: number; }
interface RefPoint { t: string; rate: number; sourceId: string; }

const REF_PALETTE = [
  'rgb(230, 165, 90)',   // amber
  'rgb(130, 165, 230)',  // periwinkle
  'rgb(200, 145, 220)',  // lilac
  'rgb(220, 180, 110)',  // sand
  'rgb(145, 195, 175)',  // sage
  'rgb(225, 145, 145)',  // coral
];

const SOURCE_LABELS: Record<string, string> = {
  xe: 'XE',
  exchangerateHost: 'open.er-api',
  googleFinance: 'Google',
  visa: 'Visa',
  frankfurter: 'Frankfurter',
  twelveData: 'Twelve Data',
  revolut: 'Revolut',
  yahooFinance: 'Yahoo',
  wiseMidMarket: 'Wise mid',
};

export function MidMarketChart({
  midSeries,
  refSeries,
}: {
  midSeries: MidPoint[];
  refSeries: RefPoint[];
}) {
  const merged = mergeSeries(midSeries, refSeries);
  const sources = Array.from(new Set(refSeries.map((r) => r.sourceId)));

  if (merged.length === 0) {
    return (
      <div className="flex h-[420px] items-center justify-center font-sans text-sm text-muted">
        No data in this window yet — first poll runs within the hour.
      </div>
    );
  }

  return (
    <div className="h-[420px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={merged}
          margin={{ top: 24, right: 32, left: 8, bottom: 8 }}
        >
          <defs>
            <linearGradient id="midFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(92, 200, 156)" stopOpacity={0.30} />
              <stop offset="60%" stopColor="rgb(92, 200, 156)" stopOpacity={0.06} />
              <stop offset="100%" stopColor="rgb(92, 200, 156)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            stroke="rgb(36, 40, 50)"
            strokeDasharray="0"
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
              letterSpacing: '0.04em',
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
            tickFormatter={(v: number) => v.toFixed(3)}
            orientation="right"
          />
          <Tooltip
            cursor={{ stroke: 'rgb(56, 62, 76)', strokeWidth: 1, strokeDasharray: '3 3' }}
            content={<CustomTooltip sources={sources} />}
          />
          <Legend
            wrapperStyle={{
              fontSize: 11,
              fontFamily: 'var(--font-sans)',
              paddingTop: 16,
              letterSpacing: '0.02em',
            }}
            iconType="plainline"
            iconSize={20}
            formatter={(value: string) => (
              <span className="ml-1.5 text-muted">
                {SOURCE_LABELS[value] ?? value}
              </span>
            )}
          />
          <Area
            type="monotone"
            dataKey="mid"
            name="Mid-market"
            stroke="rgb(92, 200, 156)"
            strokeWidth={2.5}
            fill="url(#midFill)"
            activeDot={{
              r: 5,
              strokeWidth: 2,
              stroke: 'rgb(18, 20, 26)',
              fill: 'rgb(92, 200, 156)',
            }}
            isAnimationActive={false}
          />
          {sources.map((s, i) => (
            <Line
              key={s}
              type="monotone"
              dataKey={`ref:${s}`}
              name={s}
              stroke={REF_PALETTE[i % REF_PALETTE.length]}
              strokeDasharray="2 4"
              strokeWidth={1.25}
              dot={false}
              isAnimationActive={false}
              opacity={0.7}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function CustomTooltip({
  active,
  payload,
  label,
  sources: _sources,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string; dataKey: string }>;
  label?: string;
  sources: string[];
}) {
  if (!active || !payload || payload.length === 0) return null;

  const midPoint = payload.find((p) => p.dataKey === 'mid');
  const refs = payload
    .filter((p) => p.dataKey !== 'mid')
    .sort((a, b) => b.value - a.value);

  return (
    <div className="rounded-xl border border-edge bg-surface/95 px-4 py-3 shadow-lift backdrop-blur-md">
      <div className="mb-2 font-sans text-2xs font-medium uppercase tracking-[0.18em] text-subtle">
        {label}
      </div>
      {midPoint && (
        <div className="mb-2 flex items-baseline justify-between gap-6 border-b border-edge/60 pb-2">
          <div className="flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: midPoint.color }}
              aria-hidden
            />
            <span className="font-sans text-xs font-medium text-text">Mid-market</span>
          </div>
          <span className="tabular font-mono text-sm font-medium text-text">
            {midPoint.value.toFixed(4)}
          </span>
        </div>
      )}
      {refs.length > 0 && (
        <div className="space-y-1.5">
          {refs.map((p) => (
            <div key={p.dataKey} className="flex items-baseline justify-between gap-6">
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: p.color }}
                  aria-hidden
                />
                <span className="font-sans text-2xs text-muted">
                  {SOURCE_LABELS[p.name] ?? p.name}
                </span>
              </div>
              <span className="tabular font-mono text-2xs text-muted">
                {p.value.toFixed(4)}
              </span>
            </div>
          ))}
        </div>
      )}
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

// Recharts requires the AreaChart import even when used through ComposedChart
// in some builds — keep this re-export idiom in place to avoid tree-shake regressions.
void AreaChart;
