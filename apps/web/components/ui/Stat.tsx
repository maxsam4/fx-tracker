import { type ReactNode } from 'react';

export function Stat({
  label,
  value,
  unit,
  delta,
  hint,
  size = 'md',
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  delta?: { value: number; label?: string } | null;
  hint?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const valueClass =
    size === 'lg'
      ? 'text-5xl md:text-6xl tracking-tightest'
      : size === 'md'
        ? 'text-3xl tracking-tight'
        : 'text-xl';

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-2xs font-medium uppercase tracking-[0.16em] text-subtle">
        {label}
      </span>
      <div className="flex items-baseline gap-2">
        <span className={`tabular font-mono font-medium text-text ${valueClass}`}>{value}</span>
        {unit && (
          <span className="text-sm font-medium uppercase tracking-[0.14em] text-muted">
            {unit}
          </span>
        )}
        {delta && <DeltaBadge value={delta.value} label={delta.label} />}
      </div>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}

export function DeltaBadge({ value, label }: { value: number; label?: string }) {
  const tone =
    Math.abs(value) < 0.005
      ? 'border-edge bg-surface text-muted'
      : value > 0
        ? 'border-accent/30 bg-accent/10 text-accent'
        : 'border-bad/30 bg-bad/10 text-bad';
  const sign = value > 0 ? '+' : '';
  return (
    <span
      className={`tabular ml-1 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-xs ${tone}`}
    >
      <span aria-hidden>{value > 0 ? '▲' : value < 0 ? '▼' : '◆'}</span>
      <span>
        {sign}
        {value.toFixed(2)}%
      </span>
      {label && <span className="text-2xs uppercase tracking-[0.1em] opacity-70">{label}</span>}
    </span>
  );
}
