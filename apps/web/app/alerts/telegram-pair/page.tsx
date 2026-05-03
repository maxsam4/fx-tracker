import Link from 'next/link';
import { redirect } from 'next/navigation';
import { desc } from 'drizzle-orm';
import { isAuthenticated } from '@/lib/auth';
import { getDb, botAuthorizedChats } from '@fx/core/db';
import { Card, CardHeader } from '@/components/ui/Card';

export const dynamic = 'force-dynamic';

export default async function TelegramPairPage() {
  if (!(await isAuthenticated())) redirect('/alerts/login?next=/alerts/telegram-pair');

  const db = getDb();
  const chats = await db
    .select()
    .from(botAuthorizedChats)
    .orderBy(desc(botAuthorizedChats.lastSeenAt));

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
          Telegram chats
        </h1>
        <p className="mt-2 text-sm text-muted">
          Send{' '}
          <code className="rounded bg-elevated px-1.5 py-0.5 font-mono text-xs text-text">
            /login &lt;PIN&gt;
          </code>{' '}
          to your bot to authorize a chat. Authorized chats can run{' '}
          <code className="rounded bg-elevated px-1.5 py-0.5 font-mono text-xs text-text">
            /newalert
          </code>{' '}
          and{' '}
          <code className="rounded bg-elevated px-1.5 py-0.5 font-mono text-xs text-text">
            /alerts
          </code>{' '}
          directly.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Authorized chats"
          subtitle="from /login"
          right={<span className="text-2xs uppercase tracking-[0.14em] text-subtle">{chats.length}</span>}
        />
        {chats.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-muted">
            No authorized chats yet. DM your bot{' '}
            <code className="rounded bg-elevated px-1.5 py-0.5 font-mono text-xs">
              /login &lt;PIN&gt;
            </code>{' '}
            to authorize.
          </div>
        ) : (
          <ul className="divide-y divide-edge/60">
            {chats.map((c) => (
              <li
                key={c.chatId}
                className="flex items-center justify-between gap-4 px-5 py-4"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-text">
                    {c.label ?? `chat ${c.chatId}`}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-2xs uppercase tracking-[0.12em] text-subtle">
                    <span>last seen {c.lastSeenAt.toLocaleString()}</span>
                  </div>
                </div>
                <code className="tabular shrink-0 rounded border border-edge bg-bg px-2 py-1 font-mono text-xs text-text">
                  {c.chatId}
                </code>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
