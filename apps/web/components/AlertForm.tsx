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

export function AlertForm({ initial, pairs }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ruleType, setRuleType] = useState(initial?.ruleType ?? 'threshold');
  const [pair, setPair] = useState(initial?.pair ?? pairs[0]?.key ?? '');

  const pairCfg = pairs.find((p) => p.key === pair);

  return (
    <form
      className="space-y-4 rounded-md border border-edge bg-surface p-4"
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
          className="w-full rounded border border-edge bg-bg px-2 py-1"
        />
      </Field>

      <Field label="Pair">
        <select
          name="pair"
          value={pair}
          onChange={(e) => setPair(e.target.value)}
          className="w-full rounded border border-edge bg-bg px-2 py-1"
        >
          {pairs.map((p) => (
            <option key={p.key} value={p.key}>{p.key}</option>
          ))}
        </select>
      </Field>

      <Field label="Rule type">
        <select
          name="ruleType"
          value={ruleType}
          onChange={(e) => setRuleType(e.target.value as 'interval' | 'threshold')}
          className="w-full rounded border border-edge bg-bg px-2 py-1"
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
              className="w-full rounded border border-edge bg-bg px-2 py-1"
            >
              <option value="mid_market">mid-market rate</option>
              <option value="best_effective">best effective rate at amount</option>
            </select>
          </Field>
          <Field label="Operator">
            <select
              name="thresholdOp"
              defaultValue={initial?.thresholdOp ?? 'gt'}
              className="w-full rounded border border-edge bg-bg px-2 py-1"
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
              className="w-full rounded border border-edge bg-bg px-2 py-1 font-mono"
            />
          </Field>
          {pairCfg && (
            <Field label="Reference amount">
              <select
                name="referenceAmount"
                defaultValue={initial?.referenceAmount ?? pairCfg.referenceAmounts[0]}
                className="w-full rounded border border-edge bg-bg px-2 py-1"
              >
                {pairCfg.referenceAmounts.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
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
            className="w-full rounded border border-edge bg-bg px-2 py-1 font-mono"
          />
        </Field>
      )}

      <Field label="Telegram chat ID">
        <input
          name="telegramChatId"
          required
          defaultValue={initial?.telegramChatId ?? ''}
          placeholder="-100123456789 or 123456789"
          className="w-full rounded border border-edge bg-bg px-2 py-1 font-mono"
        />
      </Field>

      <Field label="Cooldown (seconds)">
        <input
          name="cooldownSeconds"
          type="number"
          min="60"
          defaultValue={initial?.cooldownSeconds ?? 3600}
          className="w-full rounded border border-edge bg-bg px-2 py-1 font-mono"
        />
      </Field>

      {/*
        HTML checkboxes that are unchecked are simply omitted from FormData,
        which would make the server treat "uncheck this box" as "no change."
        We submit a hidden enabled=false alongside, then a checked checkbox's
        enabled=true takes precedence (FormData preserves order).
      */}
      <input type="hidden" name="enabled" value="false" />
      <Field label="Enabled">
        <input
          name="enabled"
          type="checkbox"
          value="true"
          defaultChecked={initial?.enabled ?? true}
        />
      </Field>

      {error && <p className="text-sm text-bad">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-accent px-3 py-1 text-sm font-medium text-bg disabled:opacity-50"
      >
        {pending ? 'Saving…' : initial?.id ? 'Save changes' : 'Create rule'}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="text-muted">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
