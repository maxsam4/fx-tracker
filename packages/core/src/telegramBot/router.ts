import { logger } from '../logger.js';
import { answerCallbackQuery, sendMessage, type TgUpdate } from './api.js';
import { isAuthorized, logout, touchLastSeen, tryLogin } from './auth.js';
import { clearWizard, getWizard } from './state.js';
import * as newAlert from './wizards/newAlert.js';
import * as listAlerts from './wizards/listAlerts.js';

const HELP_TEXT =
  '<b>Commands</b>\n' +
  '/newalert — create a new alert (wizard)\n' +
  '/alerts — list rules with toggle/delete actions\n' +
  '/cancel — exit the current wizard\n' +
  '/logout — revoke this chat\'s access\n' +
  '/help — this message';

function parseCommand(text: string): { cmd: string; rest: string } | null {
  if (!text.startsWith('/')) return null;
  const space = text.indexOf(' ');
  if (space === -1) return { cmd: text.slice(1).split('@')[0]!, rest: '' };
  return {
    cmd: text.slice(1, space).split('@')[0]!,
    rest: text.slice(space + 1).trim(),
  };
}

export async function handleUpdate(update: TgUpdate): Promise<void> {
  if (update.message) await handleMessage(update.message);
  else if (update.callback_query) await handleCallbackQuery(update.callback_query);
}

async function handleMessage(msg: NonNullable<TgUpdate['message']>): Promise<void> {
  const chatId = String(msg.chat.id);
  const text = msg.text?.trim() ?? '';
  if (!text) return;

  const parsed = parseCommand(text);

  // /login is the one command we accept from non-authorized chats.
  if (parsed?.cmd === 'login') {
    await handleLogin(chatId, parsed.rest);
    return;
  }

  // /start and /help: open commands. /start prompts for login.
  if (parsed?.cmd === 'start') {
    await sendMessage({
      chatId,
      text: 'Hello. Send <code>/login &lt;PIN&gt;</code> to begin.',
      parseMode: 'HTML',
    });
    return;
  }
  if (parsed?.cmd === 'help') {
    await sendMessage({ chatId, text: HELP_TEXT, parseMode: 'HTML' });
    return;
  }

  // All other paths require auth. Silent drop for unknown chats.
  const authorized = await isAuthorized(chatId);
  if (!authorized) return;

  // Refresh last-seen on any authorized message.
  void touchLastSeen(chatId).catch(() => {});

  if (parsed?.cmd === 'logout') {
    await logout(chatId);
    clearWizard(chatId);
    await sendMessage({ chatId, text: 'Logged out.' });
    return;
  }

  if (parsed?.cmd === 'cancel') {
    clearWizard(chatId);
    await sendMessage({ chatId, text: 'Cancelled.' });
    return;
  }

  if (parsed?.cmd === 'newalert') {
    await newAlert.startNewAlert(chatId);
    return;
  }

  if (parsed?.cmd === 'alerts') {
    await listAlerts.showList(chatId, 0);
    return;
  }

  // Free text inside an active wizard — pass to the wizard.
  if (!parsed) {
    const handled = await newAlert.handleText(chatId, text);
    if (!handled) {
      await sendMessage({
        chatId,
        text: 'Unknown command. /help for the list.',
      });
    }
    return;
  }

  await sendMessage({ chatId, text: 'Unknown command. /help for the list.' });
}

async function handleLogin(chatId: string, rest: string): Promise<void> {
  const pin = rest.trim();
  if (!pin) {
    await sendMessage({ chatId, text: 'Usage: /login <PIN>' });
    return;
  }
  const result = await tryLogin(chatId, pin);
  if (result.ok) {
    await sendMessage({ chatId, text: '✅ Authenticated. /help for commands.' });
    return;
  }
  if (result.reason === 'no_pin_set') {
    await sendMessage({
      chatId,
      text: 'Bot is not configured for inbound commands (TELEGRAM_BOT_PIN unset).',
    });
    return;
  }
  if (result.reason === 'locked') {
    await sendMessage({
      chatId,
      text: 'Too many attempts. Try again later.',
    });
    return;
  }
  await sendMessage({ chatId, text: 'Wrong PIN.' });
}

async function handleCallbackQuery(
  cb: NonNullable<TgUpdate['callback_query']>,
): Promise<void> {
  const data = cb.data;
  const chatId = cb.message ? String(cb.message.chat.id) : null;
  if (!chatId || !data) {
    await answerCallbackQuery({ callbackQueryId: cb.id });
    return;
  }
  const authorized = await isAuthorized(chatId);
  if (!authorized) {
    // Don't leak existence — silent ack.
    await answerCallbackQuery({ callbackQueryId: cb.id });
    return;
  }
  void touchLastSeen(chatId).catch(() => {});

  // Wizard buttons (wiz:*).
  if (data.startsWith('wiz:')) {
    try {
      await newAlert.handleCallback(chatId, data);
    } catch (err) {
      logger.error({ err: String(err) }, 'wizard callback failed');
    }
    await answerCallbackQuery({ callbackQueryId: cb.id });
    return;
  }

  // List buttons (rule:* / page:*).
  if (data.startsWith('rule:') || data.startsWith('page:')) {
    try {
      await listAlerts.handleCallback({
        chatId,
        messageId: cb.message?.message_id,
        callbackQueryId: cb.id,
        data,
      });
    } catch (err) {
      logger.error({ err: String(err) }, 'list callback failed');
      await answerCallbackQuery({ callbackQueryId: cb.id });
    }
    return;
  }

  await answerCallbackQuery({ callbackQueryId: cb.id });
}

// Re-exported for tests.
export const _internals = {
  parseCommand,
  getWizard,
};
