import { type HTMLAttributes, type ReactNode } from 'react';

export function Card({
  children,
  className = '',
  elevated = false,
  ...props
}: HTMLAttributes<HTMLDivElement> & { elevated?: boolean }) {
  return (
    <div
      className={`relative rounded-md border border-edge ${
        elevated ? 'bg-elevated' : 'bg-surface'
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  right,
  className = '',
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex items-start justify-between gap-4 border-b border-edge px-5 py-3.5 ${className}`}
    >
      <div className="min-w-0">
        <h3 className="text-2xs font-medium uppercase tracking-[0.14em] text-muted">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-subtle">{subtitle}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

export function CardBody({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`px-5 py-4 ${className}`}>{children}</div>;
}
