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
    <header className="sticky top-0 z-30 border-b border-edge/70 bg-bg/75 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-6 px-5 py-3 md:px-8">
        <Link href="/" className="group flex items-baseline gap-1">
          <span className="display-italic text-2xl font-light leading-none text-text transition-colors group-hover:text-accent">
            fx
          </span>
          <span className="ml-1 font-sans text-sm font-medium leading-none tracking-tight text-muted">
            tracker
          </span>
          <span className="ml-2 hidden font-sans text-2xs uppercase tracking-[0.22em] text-subtle md:inline">
            honest rates
          </span>
        </Link>

        <nav className="flex items-center gap-3">
          <div className="hidden items-center gap-1 rounded-full border border-edge bg-surface/70 p-1 backdrop-blur sm:inline-flex">
            {PAIRS.map((p) => {
              const active = activePair === p.key;
              return (
                <Link
                  key={p.key}
                  href={`/${p.key}`}
                  className={`tabular relative rounded-full px-4 py-1.5 font-sans text-xs font-medium tracking-tight transition-all ${
                    active
                      ? 'bg-text text-bg shadow-sm'
                      : 'text-muted hover:text-text'
                  }`}
                >
                  <span className={active ? 'opacity-60' : 'opacity-50'}>{p.from}</span>
                  <span className="mx-1 opacity-50">→</span>
                  <span>{p.to}</span>
                </Link>
              );
            })}
          </div>

          <Link
            href="/alerts"
            className={`rounded-full border px-4 py-2 font-sans text-2xs font-medium uppercase tracking-[0.18em] transition-all ${
              pathname.startsWith('/alerts')
                ? 'border-accent/40 bg-accent/15 text-accent shadow-glow'
                : 'border-edge bg-surface/70 text-muted backdrop-blur hover:border-edge-strong hover:text-text'
            }`}
          >
            Alerts
          </Link>
        </nav>
      </div>
    </header>
  );
}
