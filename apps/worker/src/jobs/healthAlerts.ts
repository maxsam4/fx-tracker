import { sql } from 'drizzle-orm';
import { logger } from '@fx/core';
import { getDb } from '@fx/core/db';
import { sendTelegramMessage } from '@fx/core/alerts';

// Watch the last 3 runs of each (provider, pair). If all 3 are non-ok and
// we haven't alerted in the last 12 hours, ping the admin chat. Prevents
// silent provider rot.
const WINDOW_LOOKBACK_RUNS = 3;
const NOTIFY_COOLDOWN_MS = 12 * 60 * 60 * 1000;

const lastNotified = new Map<string, number>();

export async function runHealthAlerts(): Promise<void> {
  const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!adminChatId) return;

  const db = getDb();
  const rows = await db.execute<{
    provider_id: string;
    pair_key: string;
    bad_streak: number;
    last_error: string | null;
  } & Record<string, unknown>>(sql`
    WITH recent AS (
      SELECT provider_id, pair_id, status, error_message, finished_at,
        ROW_NUMBER() OVER (PARTITION BY provider_id, pair_id ORDER BY finished_at DESC NULLS LAST) AS rn
      FROM provider_runs
    )
    SELECT r.provider_id,
           cp.from_code || '-' || cp.to_code AS pair_key,
           SUM(CASE WHEN r.status <> 'ok' THEN 1 ELSE 0 END) AS bad_streak,
           MAX(r.error_message) FILTER (WHERE r.status <> 'ok') AS last_error
    FROM recent r
    JOIN currency_pairs cp ON cp.id = r.pair_id
    WHERE r.rn <= ${WINDOW_LOOKBACK_RUNS}
    GROUP BY r.provider_id, cp.from_code, cp.to_code
    HAVING SUM(CASE WHEN r.status <> 'ok' THEN 1 ELSE 0 END) >= ${WINDOW_LOOKBACK_RUNS}
  `);

  for (const r of rows) {
    const key = `${r.provider_id}:${r.pair_key}`;
    const last = lastNotified.get(key);
    if (last && Date.now() - last < NOTIFY_COOLDOWN_MS) continue;
    const text = `⚠️ <b>${esc(r.provider_id)}</b> failing for <b>${esc(r.pair_key)}</b> — last ${WINDOW_LOOKBACK_RUNS} runs all non-ok.\n<code>${esc(r.last_error ?? 'n/a').slice(0, 300)}</code>`;
    const sent = await sendTelegramMessage({
      chatId: adminChatId,
      text,
      parseMode: 'HTML',
    });
    if (sent.ok) {
      lastNotified.set(key, Date.now());
      logger.warn({ key }, 'admin self-alert sent');
    }
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
