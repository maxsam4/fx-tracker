import { logger } from '../logger.js';

export interface SendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

const API_BASE = 'https://api.telegram.org';

export async function sendTelegramMessage(opts: {
  chatId: string;
  text: string;
  /** Pass `undefined` to send plain text. */
  parseMode?: 'HTML' | 'MarkdownV2';
  disableLinkPreview?: boolean;
}): Promise<SendResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return { ok: false, error: 'TELEGRAM_BOT_TOKEN not set' };
  }

  try {
    const res = await fetch(`${API_BASE}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: opts.chatId,
        text: opts.text,
        parse_mode: opts.parseMode,
        disable_web_page_preview: opts.disableLinkPreview ?? true,
      }),
    });
    const data = (await res.json()) as {
      ok: boolean;
      result?: { message_id: number };
      description?: string;
    };
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.description ?? `HTTP ${res.status}` };
    }
    return { ok: true, messageId: data.result?.message_id?.toString() };
  } catch (err) {
    logger.error({ err: String(err) }, 'telegram send failed');
    return { ok: false, error: String(err) };
  }
}

export async function getRecentChats(): Promise<
  Array<{ chatId: string; chatType: string; title: string; lastUpdate: Date }>
> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN not set');

  const res = await fetch(`${API_BASE}/bot${token}/getUpdates`);
  const data = (await res.json()) as {
    ok: boolean;
    result?: Array<{
      update_id: number;
      message?: {
        date: number;
        chat: { id: number; type: string; title?: string; first_name?: string; username?: string };
      };
    }>;
  };
  if (!data.ok) throw new Error('telegram getUpdates failed');
  const seen = new Map<string, { chatId: string; chatType: string; title: string; lastUpdate: Date }>();
  for (const u of data.result ?? []) {
    if (!u.message) continue;
    const c = u.message.chat;
    const id = String(c.id);
    seen.set(id, {
      chatId: id,
      chatType: c.type,
      title: c.title ?? c.username ?? c.first_name ?? id,
      lastUpdate: new Date(u.message.date * 1000),
    });
  }
  return [...seen.values()].sort((a, b) => b.lastUpdate.getTime() - a.lastUpdate.getTime());
}
