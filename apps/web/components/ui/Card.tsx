import { type HTMLAttributes, type ReactNode } from 'react';

export function Card({
  children,
  className = '',
  elevated = false,
  ...props
}: HTMLAttributes<HTMLDivElement> & { elevated?: boolean }) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl card-paper ${
        elevated ? 'bg-elevated' : ''
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
      className={`flex items-center justify-between gap-4 border-b border-edge/60 px-5 py-3 ${className}`}
    >
      <div className="min-w-0 flex items-baseline gap-3">
        <h3 className="display text-lg font-normal leading-tight text-text">{title}</h3>
        {subtitle && (
          <p className="font-sans text-xs text-muted">{subtitle}</p>
        )}
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
