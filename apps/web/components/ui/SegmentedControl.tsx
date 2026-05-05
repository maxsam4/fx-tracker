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
    <div className={`inline-flex items-center gap-3 ${className}`}>
      {label && (
        <span className="font-sans text-2xs font-medium uppercase tracking-[0.22em] text-subtle">
          {label}
        </span>
      )}
      <div
        role="radiogroup"
        className="inline-flex rounded-full border border-edge bg-surface/80 p-1 backdrop-blur"
      >
        {options.map((o) => (
          <Link
            key={o.key}
            href={o.href}
            role="radio"
            aria-checked={o.active}
            className={`tabular relative rounded-full px-3 py-1 font-sans text-xs font-medium transition-all ${
              o.active
                ? 'bg-text text-bg shadow-sm'
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
