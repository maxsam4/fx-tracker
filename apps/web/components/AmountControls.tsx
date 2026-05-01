'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

export function AmountControls({
  pairKey,
  current,
  options,
  from,
}: {
  pairKey: string;
  current: number;
  options: number[];
  from: string;
}) {
  const params = useSearchParams();
  const window = params.get('window') ?? '7d';

  return (
    <div className="flex gap-1 rounded-md border border-edge bg-surface p-1">
      {options.map((o) => {
        const active = o === current;
        const sp = new URLSearchParams();
        sp.set('amount', String(o));
        sp.set('window', window);
        return (
          <Link
            key={o}
            href={`/${pairKey}?${sp.toString()}`}
            className={`rounded px-2 py-1 text-xs ${
              active ? 'bg-edge text-text' : 'text-muted hover:text-text'
            }`}
          >
            {fmt(o)} {from}
          </Link>
        );
      })}
    </div>
  );
}

const fmt = (n: number) => n.toLocaleString('en-US');
