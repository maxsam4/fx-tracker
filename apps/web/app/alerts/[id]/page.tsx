import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';
import { isAuthenticated } from '@/lib/auth';
import { loadProvidersConfig } from '@fx/core/config';
import { getDb, alertRules, alertFires, currencyPairs } from '@fx/core/db';
import { AlertForm } from '@/components/AlertForm';
import { Card, CardHeader } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';

export const dynamic = 'force-dynamic';

export default async function AlertDetailPage({ params }: { params: { id: string } }) {
  if (!(await isAuthenticated())) {
    redirect(`/alerts/login?next=/alerts/${params.id}`);
  }
  const id = parseInt(params.id, 10);
  if (Number.isNaN(id)) notFound();

  const db = getDb();
  const [rule] = await db
    .select({
      id: alertRules.id,
      name: alertRules.name,
      pairId: alertRules.pairId,
      enabled: alertRules.enabled,
      ruleType: alertRules.ruleType,
      intervalSeconds: alertRules.intervalSeconds,
      thresholdOp: alertRules.thresholdOp,
      thresholdValue: alertRules.thresholdValue,
      thresholdTarget: alertRules.thresholdTarget,
      referenceAmount: alertRules.referenceAmount,
      telegramChatId: alertRules.telegramChatId,
      cooldownSeconds: alertRules.cooldownSeconds,
      from: currencyPairs.fromCode,
      to: currencyPairs.toCode,
    })
    .from(alertRules)
    .leftJoin(currencyPairs, eq(alertRules.pairId, currencyPairs.id))
    .where(eq(alertRules.id, id))
    .limit(1);

  if (!rule) notFound();

  const fires = await db
    .select()
    .from(alertFires)
    .where(eq(alertFires.ruleId, id))
    .orderBy(desc(alertFires.firedAt))
    .limit(10);

  const config = loadProvidersConfig();
  const pairs = Object.entries(config.pairs).map(([key, c]) => ({
    key,
    referenceAmounts: c.referenceAmounts,
  }));

  return (
    <div className="stagger mx-auto max-w-lg space-y-6">
      <div>
        <Link
          href="/alerts"
          className="text-2xs uppercase tracking-[0.16em] text-subtle hover:text-text"
        >
          ← Alerts
        </Link>
        <h1 className="mt-2 font-display text-3xl italic tracking-tight text-text">
          {rule.name}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Pill tone="muted" mono>
            {rule.from}-{rule.to}
          </Pill>
          <Pill tone={rule.enabled ? 'accent' : 'muted'}>
            {rule.enabled ? 'enabled' : 'disabled'}
          </Pill>
          <Pill tone="muted">{rule.ruleType}</Pill>
        </div>
      </div>

      <AlertForm
        pairs={pairs}
        initial={{
          id: rule.id,
          name: rule.name,
          pair: `${rule.from}-${rule.to}`,
          enabled: rule.enabled,
          ruleType: rule.ruleType as 'interval' | 'threshold',
          intervalSeconds: rule.intervalSeconds ?? undefined,
          thresholdOp: (rule.thresholdOp as 'gt' | 'lt' | undefined) ?? undefined,
          thresholdValue: rule.thresholdValue ? parseFloat(rule.thresholdValue) : undefined,
          thresholdTarget:
            (rule.thresholdTarget as 'mid_market' | 'best_effective' | undefined) ?? undefined,
          referenceAmount: rule.referenceAmount ? parseFloat(rule.referenceAmount) : undefined,
          telegramChatId: rule.telegramChatId,
          cooldownSeconds: rule.cooldownSeconds,
        }}
      />

      <Card>
        <CardHeader title="Recent fires" subtitle="last 10 events" />
        {fires.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-muted">
            No fires yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-edge bg-bg/40 text-2xs uppercase tracking-[0.12em] text-subtle">
                  <th className="px-5 py-3 text-left font-medium">When</th>
                  <th className="px-3 py-3 text-right font-medium">Mid</th>
                  <th className="px-3 py-3 text-left font-medium">Best</th>
                  <th className="px-5 py-3 text-left font-medium">Delivery</th>
                </tr>
              </thead>
              <tbody>
                {fires.map((f) => (
                  <tr key={f.id} className="border-b border-edge/60 last:border-b-0">
                    <td className="px-5 py-3 text-2xs uppercase tracking-[0.12em] text-muted">
                      {new Date(f.firedAt).toLocaleString()}
                    </td>
                    <td className="tabular px-3 py-3 text-right font-mono text-xs text-text">
                      {f.midRate ? parseFloat(f.midRate).toFixed(4) : '—'}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-muted">
                      <span className="text-text">{f.bestProviderId ?? '—'}</span>
                      {f.bestEffectiveRate && (
                        <span className="ml-1 text-subtle">
                          ({parseFloat(f.bestEffectiveRate).toFixed(4)})
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <Pill
                        tone={
                          f.deliveryStatus === 'sent'
                            ? 'accent'
                            : f.deliveryStatus === 'failed'
                              ? 'bad'
                              : 'muted'
                        }
                      >
                        {f.deliveryStatus}
                      </Pill>
                      {f.deliveryError && (
                        <span className="ml-2 text-2xs text-subtle">{f.deliveryError}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
