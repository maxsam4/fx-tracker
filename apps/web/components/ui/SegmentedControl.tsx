'use client';
import Link from 'next/link';
import { type ReactNode } from 'react';

interface Option {
  key: string;
  label: ReactNode;
  href: string;
  active: boolean;
}

export function SegmentedControl({
  options,
  label,
  className = '',
}: {
  options: Option[];
  label?: string;
  className?: string;
}) {
  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      {label && (
        <span className="text-2xs font-medium uppercase tracking-[0.14em] text-subtle">
          {label}
        </span>
      )}
      <div
        role="radiogroup"
        className="inline-flex rounded-md border border-edge bg-surface p-0.5"
      >
        {options.map((o) => (
          <Link
            key={o.key}
            href={o.href}
            role="radio"
            aria-checked={o.active}
            className={`relative rounded px-2.5 py-1 text-xs font-medium transition-colors ${
              o.active
                ? 'bg-elevated text-text shadow-ring'
                : 'text-muted hover:text-text'
            }`}
          >
            {o.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
