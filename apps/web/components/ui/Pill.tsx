import { type ReactNode } from 'react';

type Tone = 'neutral' | 'accent' | 'warn' | 'bad' | 'muted';

const toneStyles: Record<Tone, string> = {
  neutral: 'border-edge bg-surface text-text',
  accent: 'border-accent/30 bg-accent/10 text-accent',
  warn: 'border-warn/30 bg-warn/10 text-warn',
  bad: 'border-bad/30 bg-bad/10 text-bad',
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
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-2xs uppercase tracking-[0.12em] ${
        toneStyles[tone]
      } ${mono ? 'font-mono normal-case tracking-normal' : ''} ${className}`}
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
      ? 'bg-accent shadow-[0_0_0_3px_rgb(var(--accent)/0.15)]'
      : status === 'warn'
        ? 'bg-warn shadow-[0_0_0_3px_rgb(var(--warn)/0.15)]'
        : status === 'bad'
          ? 'bg-bad shadow-[0_0_0_3px_rgb(var(--bad)/0.15)]'
          : 'bg-subtle';
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${color} ${className}`} />;
}
