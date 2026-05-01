import Link from 'next/link';
import { redirect } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';
import { isAuthenticated } from '@/lib/auth';
import { getDb, alertRules, currencyPairs } from '@fx/core/db';
import { Card, CardHeader } from '@/components/ui/Card';
import { Pill, StatusDot } from '@/components/ui/Pill';

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
    <div className="stagger space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-2xs uppercase tracking-[0.16em] text-subtle">Admin</p>
          <h1 className="mt-1 font-display text-4xl italic tracking-tight text-text">
            Alerts
          </h1>
          <p className="mt-1 text-sm text-muted">
            Threshold and interval rules — delivered to Telegram.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/alerts/telegram-pair"
            className="rounded-md border border-edge bg-surface px-3 py-1.5 text-xs font-medium uppercase tracking-[0.14em] text-muted transition-colors hover:border-edge-strong hover:text-text"
          >
            Telegram chats
          </Link>
          <Link
            href="/alerts/new"
            className="rounded-md border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.14em] text-accent transition-colors hover:bg-accent/20"
          >
            + New rule
          </Link>
        </div>
      </header>

      <Card>
        <CardHeader
          title="Rules"
          subtitle={`${rules.length} configured`}
          right={
            <span className="text-2xs uppercase tracking-[0.14em] text-subtle">
              {rules.filter((r) => r.enabled).length} enabled
            </span>
          }
        />
        {rules.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-muted">
            No rules yet — create one to start receiving alerts.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-edge bg-bg/40 text-2xs uppercase tracking-[0.12em] text-subtle">
                  <th className="px-5 py-3 text-left font-medium">Name</th>
                  <th className="px-3 py-3 text-left font-medium">Pair</th>
                  <th className="px-3 py-3 text-left font-medium">Type</th>
                  <th className="px-3 py-3 text-left font-medium">Trigger</th>
                  <th className="px-3 py-3 text-left font-medium">Last fired</th>
                  <th className="px-5 py-3 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-edge/60 last:border-b-0 transition-colors hover:bg-elevated/60"
                  >
                    <td className="px-5 py-3.5">
                      <Link
                        href={`/alerts/${r.id}`}
                        className="font-medium text-text transition-colors hover:text-accent"
                      >
                        {r.name}
                      </Link>
                    </td>
                    <td className="tabular px-3 py-3.5 font-mono text-xs text-muted">
                      {r.from}-{r.to}
                    </td>
                    <td className="px-3 py-3.5">
                      <Pill tone="muted">{r.ruleType}</Pill>
                    </td>
                    <td className="tabular px-3 py-3.5 font-mono text-xs text-muted">
                      {r.ruleType === 'threshold'
                        ? `${r.thresholdTarget} ${r.thresholdOp === 'gt' ? '>' : '<'} ${r.thresholdValue}`
                        : `every ${r.intervalSeconds}s`}
                    </td>
                    <td className="px-3 py-3.5 text-2xs uppercase tracking-[0.12em] text-subtle">
                      {r.lastFiredAt ? new Date(r.lastFiredAt).toLocaleString() : '—'}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex items-center gap-2">
                        <StatusDot status={r.enabled ? 'ok' : 'idle'} />
                        <span
                          className={`text-2xs uppercase tracking-[0.12em] ${
                            r.enabled ? 'text-accent' : 'text-subtle'
                          }`}
                        >
                          {r.enabled ? 'enabled' : 'disabled'}
                        </span>
                      </span>
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
