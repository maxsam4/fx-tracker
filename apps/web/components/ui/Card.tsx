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
      className={`flex items-start justify-between gap-6 border-b border-edge/60 px-7 py-5 ${className}`}
    >
      <div className="min-w-0">
        <h3 className="display text-xl font-normal leading-tight text-text">{title}</h3>
        {subtitle && (
          <p className="mt-1.5 font-sans text-sm leading-snug text-muted">{subtitle}</p>
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
  return <div className={`px-7 py-6 ${className}`}>{children}</div>;
}
