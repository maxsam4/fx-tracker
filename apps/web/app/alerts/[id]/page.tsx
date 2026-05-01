import { redirect, notFound } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';
import { isAuthenticated } from '@/lib/auth';
import { loadProvidersConfig } from '@fx/core/config';
import { getDb, alertRules, alertFires, currencyPairs } from '@fx/core/db';
import { AlertForm } from '@/components/AlertForm';

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
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-xl font-semibold">Edit rule: {rule.name}</h1>
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

      <section>
        <h2 className="mb-2 text-sm font-medium text-muted">Recent fires</h2>
        <div className="rounded-md border border-edge bg-surface">
          {fires.length === 0 ? (
            <div className="p-4 text-sm text-muted">No fires yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-muted">
                <tr>
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">Mid</th>
                  <th className="px-3 py-2">Best</th>
                  <th className="px-3 py-2">Delivery</th>
                </tr>
              </thead>
              <tbody>
                {fires.map((f) => (
                  <tr key={f.id} className="border-t border-edge">
                    <td className="px-3 py-2 font-mono text-xs">
                      {new Date(f.firedAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {f.midRate ? parseFloat(f.midRate).toFixed(4) : '—'}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {f.bestProviderId ?? '—'}{' '}
                      {f.bestEffectiveRate ? `(${parseFloat(f.bestEffectiveRate).toFixed(4)})` : ''}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          f.deliveryStatus === 'sent'
                            ? 'text-accent'
                            : f.deliveryStatus === 'failed'
                            ? 'text-bad'
                            : 'text-muted'
                        }
                      >
                        {f.deliveryStatus}
                      </span>
                      {f.deliveryError && (
                        <span className="ml-2 text-xs text-muted">{f.deliveryError}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
