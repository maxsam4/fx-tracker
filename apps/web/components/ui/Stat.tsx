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
      ? 'rate-display text-7xl md:text-[7.5rem] font-light text-text'
      : size === 'md'
        ? 'rate-display text-5xl font-normal text-text'
        : 'font-sans tabular text-2xl font-medium text-text';

  return (
    <div className="flex flex-col gap-3">
      <span className="font-sans text-2xs font-medium uppercase tracking-[0.22em] text-subtle">
        {label}
      </span>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <span className={`tabular ${valueClass}`}>{value}</span>
        {unit && (
          <span className="font-sans text-sm font-medium uppercase tracking-[0.18em] text-muted">
            {unit}
          </span>
        )}
        {delta && <DeltaBadge value={delta.value} label={delta.label} />}
      </div>
      {hint && <span className="font-sans text-sm text-muted">{hint}</span>}
    </div>
  );
}

export function DeltaBadge({ value, label }: { value: number; label?: string }) {
  const tone =
    Math.abs(value) < 0.005
      ? 'border-edge bg-surface text-muted'
      : value > 0
        ? 'border-accent/35 bg-accent/12 text-accent'
        : 'border-bad/35 bg-bad/12 text-bad';
  const sign = value > 0 ? '+' : '';
  return (
    <span
      className={`tabular inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-sans text-xs font-medium ${tone}`}
    >
      <span aria-hidden className="text-[10px]">
        {value > 0 ? '↑' : value < 0 ? '↓' : '◆'}
      </span>
      <span>
        {sign}
        {value.toFixed(2)}%
      </span>
      {label && (
        <span className="text-2xs uppercase tracking-[0.16em] opacity-70">{label}</span>
      )}
    </span>
  );
}
