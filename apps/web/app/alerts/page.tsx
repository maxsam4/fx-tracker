import Link from 'next/link';
import { redirect } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';
import { isAuthenticated } from '@/lib/auth';
import { getDb, alertRules, alertFires, currencyPairs } from '@fx/core/db';

export const dynamic = 'force-dynamic';

export default async function AlertsListPage() {
  if (!(await isAuthenticated())) redirect('/alerts/login');

  const db = getDb();
  const rules = await db
    .select({
      id: alertRules.id,
      name: alertRules.name,
      pairId: alertRules.pairId,
      enabled: alertRules.enabled,
      ruleType: alertRules.ruleType,
      thresholdOp: alertRules.thresholdOp,
      thresholdValue: alertRules.thresholdValue,
      thresholdTarget: alertRules.thresholdTarget,
      intervalSeconds: alertRules.intervalSeconds,
      lastFiredAt: alertRules.lastFiredAt,
      from: currencyPairs.fromCode,
      to: currencyPairs.toCode,
    })
    .from(alertRules)
    .leftJoin(currencyPairs, eq(alertRules.pairId, currencyPairs.id))
    .orderBy(desc(alertRules.createdAt));

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <h1 className="text-xl font-semibold">Alerts</h1>
        <Link
          href="/alerts/new"
          className="rounded bg-accent px-3 py-1 text-sm font-medium text-bg"
        >
          New rule
        </Link>
      </div>

      <div className="rounded-md border border-edge bg-surface">
        {rules.length === 0 ? (
          <div className="p-6 text-center text-muted">No rules yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-muted">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Pair</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Trigger</th>
                <th className="px-3 py-2">Last fired</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} className="border-t border-edge">
                  <td className="px-3 py-2">
                    <Link href={`/alerts/${r.id}`} className="text-text hover:underline">
                      {r.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {r.from}-{r.to}
                  </td>
                  <td className="px-3 py-2">{r.ruleType}</td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {r.ruleType === 'threshold'
                      ? `${r.thresholdTarget} ${r.thresholdOp === 'gt' ? '>' : '<'} ${r.thresholdValue}`
                      : `every ${r.intervalSeconds}s`}
                  </td>
                  <td className="px-3 py-2 text-muted">
                    {r.lastFiredAt ? new Date(r.lastFiredAt).toLocaleString() : '—'}
                  </td>
                  <td className="px-3 py-2">
                    {r.enabled ? (
                      <span className="text-accent">enabled</span>
                    ) : (
                      <span className="text-muted">disabled</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
