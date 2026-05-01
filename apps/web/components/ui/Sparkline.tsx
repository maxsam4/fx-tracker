interface Point {
  t: string;
  rate: number;
}

export function Sparkline({
  points,
  width = 96,
  height = 28,
  tone = 'neutral',
}: {
  points: Point[];
  width?: number;
  height?: number;
  tone?: 'neutral' | 'positive' | 'negative';
}) {
  if (points.length < 2) {
    return (
      <span className="inline-block h-[28px] w-[96px] text-2xs text-subtle">—</span>
    );
  }
  const ys = points.map((p) => p.rate);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const span = max - min || 1;
  const stepX = width / (points.length - 1);

  const coords = points.map((p, i) => {
    const x = i * stepX;
    const y = height - ((p.rate - min) / span) * (height - 4) - 2;
    return [x, y] as const;
  });

  const path = coords
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(' ');

  const area = `${path} L${(coords[coords.length - 1]?.[0] ?? 0).toFixed(2)},${height} L0,${height} Z`;

  const stroke =
    tone === 'positive'
      ? 'rgb(var(--accent))'
      : tone === 'negative'
        ? 'rgb(var(--bad))'
        : 'rgb(var(--muted))';
  const fill =
    tone === 'positive'
      ? 'rgb(var(--accent) / 0.12)'
      : tone === 'negative'
        ? 'rgb(var(--bad) / 0.12)'
        : 'rgb(var(--muted) / 0.08)';

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
      aria-hidden
    >
      <path d={area} fill={fill} stroke="none" />
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
