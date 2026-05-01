'use client';
import { useSearchParams } from 'next/navigation';
import { SegmentedControl } from './ui/SegmentedControl';

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
    <SegmentedControl
      label="Send"
      options={options.map((o) => {
        const sp = new URLSearchParams();
        sp.set('amount', String(o));
        sp.set('window', window);
        return {
          key: String(o),
          active: o === current,
          href: `/${pairKey}?${sp.toString()}`,
          label: (
            <span className="tabular font-mono">
              {fmt(o)}
              <span className="ml-1 text-subtle">{from}</span>
            </span>
          ),
        };
      })}
    />
  );
}

const fmt = (n: number) => n.toLocaleString('en-US');
