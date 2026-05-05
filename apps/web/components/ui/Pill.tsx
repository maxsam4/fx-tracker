import { type ReactNode } from 'react';

type Tone = 'neutral' | 'accent' | 'warn' | 'bad' | 'muted';

const toneStyles: Record<Tone, string> = {
  neutral: 'border-edge bg-surface text-text',
  accent: 'border-accent/35 bg-accent/12 text-accent',
  warn: 'border-warn/35 bg-warn/12 text-warn',
  bad: 'border-bad/35 bg-bad/12 text-bad',
  muted: 'border-edge bg-surface text-muted',
};

export function Pill({
  children,
  tone = 'neutral',
  mono = false,
  className = '',
}: {
  children: ReactNode;
  tone?: Tone;
  mono?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-2xs font-medium uppercase tracking-[0.14em] ${
        toneStyles[tone]
      } ${mono ? 'font-mono normal-case tracking-normal' : 'font-sans'} ${className}`}
    >
      {children}
    </span>
  );
}

export function StatusDot({
  status,
  className = '',
}: {
  status: 'ok' | 'warn' | 'bad' | 'idle';
  className?: string;
}) {
  const color =
    status === 'ok'
      ? 'bg-accent dot-glow-accent'
      : status === 'warn'
        ? 'bg-warn shadow-[0_0_0_4px_rgb(var(--warn)/0.18),0_0_12px_rgb(var(--warn)/0.4)]'
        : status === 'bad'
          ? 'bg-bad shadow-[0_0_0_4px_rgb(var(--bad)/0.18),0_0_12px_rgb(var(--bad)/0.4)]'
          : 'bg-subtle';
  return (
    <span
      className={`inline-block h-1.5 w-1.5 rounded-full ${color} ${
        status === 'ok' ? 'pulse-soft' : ''
      } ${className}`}
    />
  );
}
