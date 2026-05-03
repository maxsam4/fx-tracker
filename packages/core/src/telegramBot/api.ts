import { logger } from '../logger.js';

const API_BASE = 'https://api.telegram.org';

function token(): string {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error('TELEGRAM_BOT_TOKEN not set');
  return t;
}

export interface InlineKeyboardButton {
  text: string;
  callback_data: string;
}

export type InlineKeyboard = InlineKeyboardButton[][];

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
}

export interface TgMessage {
  message_id: number;
  from?: { id: number; is_bot?: boolean; username?: string; first_name?: string };
  chat: { id: number; type: string; title?: string; username?: string; first_name?: string };
  date: number;
  text?: string;
  entities?: Array<{ type: string; offset: number; length: number }>;
}

export interface TgCallbackQuery {
  id: string;
  from: { id: number; username?: string; first_name?: string };
  message?: TgMessage;
  data?: string;
}

interface TgResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

async function callApi<T>(method: string, body?: unknown, signal?: AbortSignal): Promise<TgResponse<T>> {
  const res = await fetch(`${API_BASE}/bot${token()}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body == null ? undefined : JSON.stringify(body),
    signal,
  });
  return (await res.json()) as TgResponse<T>;
}

export interface SendMessageOpts {
  chatId: string | number;
  text: string;
  parseMode?: 'HTML' | 'MarkdownV2';
  disableLinkPreview?: boolean;
  replyMarkup?: { inline_keyboard: InlineKeyboard };
}

export async function sendMessage(opts: SendMessageOpts): Promise<TgMessage | null> {
  const res = await callApi<TgMessage>('sendMessage', {
    chat_id: opts.chatId,
    text: opts.text,
    parse_mode: opts.parseMode,
    disable_web_page_preview: opts.disableLinkPreview ?? true,
    reply_markup: opts.replyMarkup,
  });
  if (!res.ok) {
    logger.error({ method: 'sendMessage', err: res.description }, 'telegram api error');
    return null;
  }
  return res.result ?? null;
}

export interface EditMessageOpts {
  chatId: string | number;
  messageId: number;
  text: string;
  parseMode?: 'HTML' | 'MarkdownV2';
  replyMarkup?: { inline_keyboard: InlineKeyboard };
}

export async function editMessageText(opts: EditMessageOpts): Promise<boolean> {
  const res = await callApi<TgMessage | boolean>('editMessageText', {
    chat_id: opts.chatId,
    message_id: opts.messageId,
    text: opts.text,
    parse_mode: opts.parseMode,
    disable_web_page_preview: true,
    reply_markup: opts.replyMarkup,
  });
  if (!res.ok) {
    // "message is not modified" is common and harmless when toggling buttons.
    if (res.description?.includes('message is not modified')) return true;
    logger.error({ method: 'editMessageText', err: res.description }, 'telegram api error');
    return false;
  }
  return true;
}

export async function answerCallbackQuery(opts: {
  callbackQueryId: string;
  text?: string;
  showAlert?: boolean;
}): Promise<void> {
  await callApi('answerCallbackQuery', {
    callback_query_id: opts.callbackQueryId,
    text: opts.text,
    show_alert: opts.showAlert ?? false,
  });
}

export async function deleteMessage(chatId: string | number, messageId: number): Promise<void> {
  await callApi('deleteMessage', { chat_id: chatId, message_id: messageId });
}

export interface GetUpdatesOpts {
  offset?: number;
  timeoutSeconds: number;
  signal?: AbortSignal;
}

export async function getUpdates(opts: GetUpdatesOpts): Promise<TgUpdate[]> {
  const res = await callApi<TgUpdate[]>(
    'getUpdates',
    {
      offset: opts.offset,
      timeout: opts.timeoutSeconds,
      allowed_updates: ['message', 'callback_query'],
    },
    opts.signal,
  );
  if (!res.ok) {
    throw new Error(`getUpdates failed: ${res.description ?? 'unknown'}`);
  }
  return res.result ?? [];
}

export function htmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
