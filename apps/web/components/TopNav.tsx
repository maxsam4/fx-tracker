'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const PAIRS = [
  { key: 'AED-INR', from: 'AED', to: 'INR' },
  { key: 'USD-INR', from: 'USD', to: 'INR' },
];

export function TopNav() {
  const pathname = usePathname() ?? '/';
  const activePair = PAIRS.find((p) => pathname.startsWith(`/${p.key}`))?.key;

  return (
    <header className="sticky top-0 z-30 border-b border-edge bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-3.5 md:px-8">
        <Link href="/" className="group flex items-baseline gap-1.5">
          <span className="font-display text-2xl italic leading-none tracking-tight text-text transition-colors group-hover:text-accent">
            fx
          </span>
          <span className="font-mono text-sm leading-none text-subtle">·</span>
          <span className="font-mono text-sm font-medium leading-none tracking-tight text-text">
            tracker
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          <div className="hidden items-center gap-0.5 rounded-md border border-edge bg-surface p-0.5 sm:inline-flex">
            {PAIRS.map((p) => {
              const active = activePair === p.key;
              return (
                <Link
                  key={p.key}
                  href={`/${p.key}`}
                  className={`tabular relative rounded px-2.5 py-1 font-mono text-xs font-medium tracking-tight transition-colors ${
                    active
                      ? 'bg-elevated text-text shadow-ring'
                      : 'text-muted hover:text-text'
                  }`}
                >
                  <span className="text-subtle">{p.from}</span>
                  <span className="mx-0.5 text-subtle">→</span>
                  <span>{p.to}</span>
                </Link>
              );
            })}
          </div>

          <Link
            href="/alerts"
            className={`ml-2 rounded-md border px-3 py-1.5 text-xs font-medium uppercase tracking-[0.14em] transition-colors ${
              pathname.startsWith('/alerts')
                ? 'border-accent/40 bg-accent/10 text-accent'
                : 'border-edge bg-surface text-muted hover:border-edge-strong hover:text-text'
            }`}
          >
            Alerts
          </Link>
        </nav>
      </div>
    </header>
  );
}
