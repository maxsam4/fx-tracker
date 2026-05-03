import {
  deleteAlertRule,
  getAlertRuleById,
  listAlertRules,
  setAlertEnabled,
  type ListedAlertRule,
} from '../../alerts/ruleCommands.js';
import {
  answerCallbackQuery,
  editMessageText,
  sendMessage,
  type InlineKeyboard,
} from '../api.js';
import { formatRuleLine } from '../format.js';

const PAGE_SIZE = 5;

function rulesKeyboard(
  rules: Array<{ id: number; enabled: boolean }>,
  page: number,
  hasMore: boolean,
): InlineKeyboard {
  const kb: InlineKeyboard = [];
  for (const r of rules) {
    kb.push([
      r.enabled
        ? { text: '🔕 Disable', callback_data: `rule:${r.id}:disable` }
        : { text: '🔔 Enable', callback_data: `rule:${r.id}:enable` },
      { text: '🗑 Delete', callback_data: `rule:${r.id}:delete:ask` },
    ]);
  }
  const nav: InlineKeyboard[number] = [];
  if (page > 0) nav.push({ text: '< Prev', callback_data: `page:prev:${page - 1}` });
  if (hasMore) nav.push({ text: 'Next >', callback_data: `page:next:${page + 1}` });
  if (nav.length) kb.push(nav);
  return kb;
}

function rulesText(rules: ListedAlertRule[]): string {
  if (rules.length === 0) return 'No alert rules yet — use /newalert to create one.';
  return rules.map((r) => formatRuleLine(r)).join('\n');
}

export async function showList(chatId: string, page = 0): Promise<void> {
  const result = await listAlertRules({ page, pageSize: PAGE_SIZE });
  // Probe one extra to know if there are more pages.
  const probe = await listAlertRules({ page: page + 1, pageSize: 1 });
  const hasMore = probe.rows.length > 0;
  await sendMessage({
    chatId,
    text: rulesText(result.rows),
    parseMode: 'HTML',
    replyMarkup: { inline_keyboard: rulesKeyboard(result.rows, page, hasMore) },
  });
}

export async function handleCallback(opts: {
  chatId: string;
  messageId: number | undefined;
  callbackQueryId: string;
  data: string;
}): Promise<void> {
  const parts = opts.data.split(':');

  // Pagination
  if (parts[0] === 'page' && (parts[1] === 'next' || parts[1] === 'prev')) {
    const page = Math.max(0, parseInt(parts[2] ?? '0', 10));
    const result = await listAlertRules({ page, pageSize: PAGE_SIZE });
    const probe = await listAlertRules({ page: page + 1, pageSize: 1 });
    const hasMore = probe.rows.length > 0;
    if (opts.messageId != null) {
      await editMessageText({
        chatId: opts.chatId,
        messageId: opts.messageId,
        text: rulesText(result.rows),
        parseMode: 'HTML',
        replyMarkup: { inline_keyboard: rulesKeyboard(result.rows, page, hasMore) },
      });
    }
    await answerCallbackQuery({ callbackQueryId: opts.callbackQueryId });
    return;
  }

  // Per-rule actions
  if (parts[0] === 'rule') {
    const id = parseInt(parts[1] ?? '', 10);
    if (!Number.isFinite(id)) return;
    const action = parts[2];

    if (action === 'disable' || action === 'enable') {
      await setAlertEnabled(id, action === 'enable');
      await answerCallbackQuery({
        callbackQueryId: opts.callbackQueryId,
        text: action === 'enable' ? 'Enabled' : 'Disabled',
      });
      // Re-render the page the user was looking at. We don't track which page
      // it was, so refresh page 0 — the user will navigate back if needed.
      const result = await listAlertRules({ page: 0, pageSize: PAGE_SIZE });
      const probe = await listAlertRules({ page: 1, pageSize: 1 });
      if (opts.messageId != null) {
        await editMessageText({
          chatId: opts.chatId,
          messageId: opts.messageId,
          text: rulesText(result.rows),
          parseMode: 'HTML',
          replyMarkup: {
            inline_keyboard: rulesKeyboard(result.rows, 0, probe.rows.length > 0),
          },
        });
      }
      return;
    }

    if (action === 'delete') {
      const phase = parts[3];
      if (phase === 'ask') {
        const rule = await getAlertRuleById(id);
        if (!rule) {
          await answerCallbackQuery({
            callbackQueryId: opts.callbackQueryId,
            text: 'Rule not found',
          });
          return;
        }
        if (opts.messageId != null) {
          await editMessageText({
            chatId: opts.chatId,
            messageId: opts.messageId,
            text: `Delete rule <b>#${id}</b>?\n${formatRuleLine(rule)}`,
            parseMode: 'HTML',
            replyMarkup: {
              inline_keyboard: [
                [
                  { text: '✅ Yes, delete', callback_data: `rule:${id}:delete:yes` },
                  { text: '✖ No, keep', callback_data: 'rule:list:back' },
                ],
              ],
            },
          });
        }
        await answerCallbackQuery({ callbackQueryId: opts.callbackQueryId });
        return;
      }
      if (phase === 'yes') {
        await deleteAlertRule(id);
        await answerCallbackQuery({
          callbackQueryId: opts.callbackQueryId,
          text: 'Deleted',
        });
        const result = await listAlertRules({ page: 0, pageSize: PAGE_SIZE });
        const probe = await listAlertRules({ page: 1, pageSize: 1 });
        if (opts.messageId != null) {
          await editMessageText({
            chatId: opts.chatId,
            messageId: opts.messageId,
            text: rulesText(result.rows),
            parseMode: 'HTML',
            replyMarkup: {
              inline_keyboard: rulesKeyboard(result.rows, 0, probe.rows.length > 0),
            },
          });
        }
        return;
      }
    }

    if (parts[1] === 'list' && parts[2] === 'back') {
      const result = await listAlertRules({ page: 0, pageSize: PAGE_SIZE });
      const probe = await listAlertRules({ page: 1, pageSize: 1 });
      if (opts.messageId != null) {
        await editMessageText({
          chatId: opts.chatId,
          messageId: opts.messageId,
          text: rulesText(result.rows),
          parseMode: 'HTML',
          replyMarkup: {
            inline_keyboard: rulesKeyboard(result.rows, 0, probe.rows.length > 0),
          },
        });
      }
      await answerCallbackQuery({ callbackQueryId: opts.callbackQueryId });
      return;
    }
  }

  await answerCallbackQuery({ callbackQueryId: opts.callbackQueryId });
}
