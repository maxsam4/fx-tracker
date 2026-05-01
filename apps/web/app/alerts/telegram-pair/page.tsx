import { redirect } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';
import { getRecentChats } from '@fx/core/alerts';

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
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="text-xl font-semibold">Telegram chat IDs</h1>
      <p className="text-sm text-muted">
        Send <span className="font-mono">/start</span> to your bot from any chat (DM, group,
        channel) and the bot will appear here. Copy the chat ID into your alert rule.
      </p>
      {error && <div className="rounded bg-bad/10 p-3 text-sm text-bad">{error}</div>}
      <div className="rounded-md border border-edge bg-surface">
        {chats.length === 0 ? (
          <div className="p-4 text-sm text-muted">
            No recent chats. Make sure <span className="font-mono">TELEGRAM_BOT_TOKEN</span> is
            set and the bot has received at least one message in the last 24h.
          </div>
        ) : (
          <ul className="divide-y divide-edge">
            {chats.map((c) => (
              <li key={c.chatId} className="flex items-center justify-between p-3 text-sm">
                <div>
                  <div className="font-medium">{c.title}</div>
                  <div className="text-xs text-muted">
                    {c.chatType} · last activity {c.lastUpdate.toLocaleString()}
                  </div>
                </div>
                <code className="rounded bg-bg px-2 py-1 font-mono text-xs">
                  {c.chatId}
                </code>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
