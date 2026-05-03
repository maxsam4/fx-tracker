'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export interface AlertFormInitial {
  id?: number;
  name?: string;
  pair?: string;
  enabled?: boolean;
  ruleType?: 'interval' | 'threshold';
  intervalSeconds?: number;
  thresholdOp?: 'gt' | 'lt';
  thresholdValue?: number;
  thresholdTarget?: 'mid_market' | 'best_effective';
  referenceAmount?: number;
  telegramChatId?: string;
  cooldownSeconds?: number;
}

interface Props {
  initial?: AlertFormInitial;
  pairs: Array<{ key: string; referenceAmounts: number[] }>;
}

const inputClass =
  'w-full rounded border border-edge bg-bg px-3 py-2 text-sm text-text transition-colors placeholder:text-subtle hover:border-edge-strong focus:border-accent/50';

const monoInputClass = `${inputClass} tabular font-mono`;

export function AlertForm({ initial, pairs }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ruleType, setRuleType] = useState(initial?.ruleType ?? 'threshold');
  const [pair, setPair] = useState(initial?.pair ?? pairs[0]?.key ?? '');

  const pairCfg = pairs.find((p) => p.key === pair);

  return (
    <form
      className="space-y-5 rounded-md border border-edge bg-surface p-6"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const data = new FormData(e.currentTarget);
        const body = Object.fromEntries(data.entries());
        startTransition(async () => {
          const url = initial?.id ? `/alerts/api/rules/${initial.id}` : '/alerts/api/rules';
          const method = initial?.id ? 'PATCH' : 'POST';
          const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (!res.ok) {
            const txt = await res.text();
            setError(txt || `HTTP ${res.status}`);
            return;
          }
          router.push('/alerts');
          router.refresh();
        });
      }}
    >
      <Field label="Name">
        <input
          name="name"
          required
          defaultValue={initial?.name ?? ''}
          className={inputClass}
        />
      </Field>

      <Field label="Pair">
        <select
          name="pair"
          value={pair}
          onChange={(e) => setPair(e.target.value)}
          className={inputClass}
        >
          {pairs.map((p) => (
            <option key={p.key} value={p.key}>
              {p.key}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Rule type">
        <select
          name="ruleType"
          value={ruleType}
          onChange={(e) => setRuleType(e.target.value as 'interval' | 'threshold')}
          className={inputClass}
        >
          <option value="threshold">threshold (price crosses target)</option>
          <option value="interval">interval (digest every N seconds)</option>
        </select>
      </Field>

      {ruleType === 'threshold' && (
        <>
          <Field label="Target">
            <select
              name="thresholdTarget"
              defaultValue={initial?.thresholdTarget ?? 'mid_market'}
              className={inputClass}
            >
              <option value="mid_market">mid-market rate</option>
              <option value="best_effective">best effective rate at amount</option>
            </select>
          </Field>
          <Field label="Operator">
            <select
              name="thresholdOp"
              defaultValue={initial?.thresholdOp ?? 'gt'}
              className={inputClass}
            >
              <option value="gt">crosses above (&gt;)</option>
              <option value="lt">crosses below (&lt;)</option>
            </select>
          </Field>
          <Field label="Threshold value">
            <input
              name="thresholdValue"
              type="number"
              step="0.0001"
              required
              defaultValue={initial?.thresholdValue ?? ''}
              className={monoInputClass}
            />
          </Field>
          {pairCfg && (
            <Field label="Reference amount">
              <input
                type="hidden"
                name="referenceAmount"
                value={pairCfg.referenceAmounts[0]}
              />
              <div className={`${monoInputClass} bg-elevated/40 text-muted`}>
                {pairCfg.referenceAmounts[0]?.toLocaleString('en-US')} {pair.split('-')[0]}
              </div>
            </Field>
          )}
        </>
      )}

      {ruleType === 'interval' && (
        <Field label="Interval (seconds)">
          <input
            name="intervalSeconds"
            type="number"
            min="60"
            required
            defaultValue={initial?.intervalSeconds ?? 21600}
            className={monoInputClass}
          />
        </Field>
      )}

      <Field label="Telegram chat ID">
        <input
          name="telegramChatId"
          required
          defaultValue={initial?.telegramChatId ?? ''}
          placeholder="-100123456789 or 123456789"
          className={monoInputClass}
        />
      </Field>

      <Field label="Cooldown (seconds)">
        <input
          name="cooldownSeconds"
          type="number"
          min="60"
          defaultValue={initial?.cooldownSeconds ?? 3600}
          className={monoInputClass}
        />
      </Field>

      {/*
        HTML checkboxes that are unchecked are simply omitted from FormData,
        which would make the server treat "uncheck this box" as "no change."
        We submit a hidden enabled=false alongside, then a checked checkbox's
        enabled=true takes precedence (FormData preserves order).
      */}
      <input type="hidden" name="enabled" value="false" />
      <label className="flex cursor-pointer items-center gap-3 rounded border border-edge bg-bg/40 px-3 py-2.5 text-sm">
        <input
          name="enabled"
          type="checkbox"
          value="true"
          defaultChecked={initial?.enabled ?? true}
          className="h-4 w-4 cursor-pointer accent-[rgb(var(--accent))]"
        />
        <span className="text-2xs font-medium uppercase tracking-[0.14em] text-muted">
          Enabled
        </span>
      </label>

      {error && (
        <p className="rounded border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-accent/40 bg-accent/15 px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] text-accent transition-colors hover:bg-accent/25 disabled:opacity-50"
      >
        {pending ? 'Saving…' : initial?.id ? 'Save changes →' : 'Create rule →'}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-2xs font-medium uppercase tracking-[0.14em] text-subtle">
        {label}
      </span>
      <div className="mt-2">{children}</div>
    </label>
  );
}
