import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';
import { getRecentChats } from '@fx/core/alerts';
import { Card, CardHeader } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';

export const dynamic = 'force-dynamic';

export default async function TelegramPairPage() {
  if (!(await isAuthenticated())) redirect('/alerts/login?next=/alerts/telegram-pair');

  let chats: Awaited<ReturnType<typeof getRecentChats>> = [];
  let error: string | null = null;
  try {
    chats = await getRecentChats();
  } catch (e) {
    error = String(e);
  }

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
          Send <code className="rounded bg-elevated px-1.5 py-0.5 font-mono text-xs text-text">/start</code>{' '}
          to your bot from any chat (DM, group, channel) and the bot will appear here. Copy the
          chat ID into your alert rule.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad">
          {error}
        </div>
      )}

      <Card>
        <CardHeader
          title="Recent chats"
          subtitle="last 24h activity"
          right={<span className="text-2xs uppercase tracking-[0.14em] text-subtle">{chats.length}</span>}
        />
        {chats.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-muted">
            No recent chats. Make sure{' '}
            <code className="rounded bg-elevated px-1.5 py-0.5 font-mono text-xs">
              TELEGRAM_BOT_TOKEN
            </code>{' '}
            is set and the bot has received at least one message in the last 24h.
          </div>
        ) : (
          <ul className="divide-y divide-edge/60">
            {chats.map((c) => (
              <li
                key={c.chatId}
                className="flex items-center justify-between gap-4 px-5 py-4"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-text">{c.title}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-2xs uppercase tracking-[0.12em] text-subtle">
                    <Pill tone="muted">{c.chatType}</Pill>
                    <span>last activity {c.lastUpdate.toLocaleString()}</span>
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
