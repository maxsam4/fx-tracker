import { loadProvidersConfig, type ProvidersConfig } from '../../config/loadProviders.js';
import {
  createAlertRule,
  RuleValidationError,
} from '../../alerts/ruleCommands.js';
import {
  sendMessage,
  editMessageText,
  type InlineKeyboard,
} from '../api.js';
import {
  clearWizard,
  getWizard,
  setWizard,
  type NewAlertPartial,
} from '../state.js';
import { deriveRuleName, humanCooldown, humanInterval } from '../format.js';
import { logger } from '../../logger.js';

let cachedProviders: ProvidersConfig | null = null;
function providers(): ProvidersConfig {
  if (!cachedProviders) cachedProviders = loadProvidersConfig();
  return cachedProviders;
}
export function _resetProvidersCacheForTest(): void {
  cachedProviders = null;
}

const COOLDOWN_PRESETS: Array<[label: string, seconds: number]> = [
  ['1h', 3600],
  ['4h', 14400],
  ['24h', 86400],
];

const INTERVAL_PRESETS: Array<[label: string, seconds: number]> = [
  ['1h', 3600],
  ['6h', 21600],
  ['24h', 86400],
];

function pairButtons(): InlineKeyboard {
  const cfg = providers();
  const enabledPairs = Object.entries(cfg.pairs)
    .filter(([, p]) => p.enabled)
    .map(([key]) => key);
  // One button per row for clarity on phones.
  return enabledPairs.map((p) => [{ text: p, callback_data: `wiz:pair:${p}` }]);
}

function ruleTypeButtons(): InlineKeyboard {
  return [
    [
      { text: 'Threshold', callback_data: 'wiz:type:threshold' },
      { text: 'Interval', callback_data: 'wiz:type:interval' },
    ],
    [{ text: '✖ Cancel', callback_data: 'wiz:cancel' }],
  ];
}

function targetButtons(): InlineKeyboard {
  return [
    [
      { text: 'Mid-market', callback_data: 'wiz:target:mid_market' },
      { text: 'Best effective', callback_data: 'wiz:target:best_effective' },
    ],
    [{ text: '✖ Cancel', callback_data: 'wiz:cancel' }],
  ];
}

function opButtons(): InlineKeyboard {
  return [
    [
      { text: '> (above)', callback_data: 'wiz:op:gt' },
      { text: '< (below)', callback_data: 'wiz:op:lt' },
    ],
    [{ text: '✖ Cancel', callback_data: 'wiz:cancel' }],
  ];
}

function cooldownButtons(): InlineKeyboard {
  return [
    COOLDOWN_PRESETS.map(([label, secs]) => ({
      text: label,
      callback_data: `wiz:cd:${secs}`,
    })),
    [
      { text: 'Custom', callback_data: 'wiz:cd:custom' },
      { text: '✖ Cancel', callback_data: 'wiz:cancel' },
    ],
  ];
}

function intervalButtons(): InlineKeyboard {
  return [
    INTERVAL_PRESETS.map(([label, secs]) => ({
      text: label,
      callback_data: `wiz:int:${secs}`,
    })),
    [
      { text: 'Custom', callback_data: 'wiz:int:custom' },
      { text: '✖ Cancel', callback_data: 'wiz:cancel' },
    ],
  ];
}

function confirmButtons(): InlineKeyboard {
  return [
    [
      { text: '✅ Confirm', callback_data: 'wiz:confirm' },
      { text: '✖ Cancel', callback_data: 'wiz:cancel' },
    ],
  ];
}

async function showStep(
  chatId: string,
  promptMessageId: number | undefined,
  text: string,
  keyboard: InlineKeyboard,
): Promise<number | undefined> {
  if (promptMessageId != null) {
    await editMessageText({
      chatId,
      messageId: promptMessageId,
      text,
      parseMode: 'HTML',
      replyMarkup: { inline_keyboard: keyboard },
    });
    return promptMessageId;
  }
  const sent = await sendMessage({
    chatId,
    text,
    parseMode: 'HTML',
    replyMarkup: { inline_keyboard: keyboard },
  });
  return sent?.message_id;
}

function summary(p: NewAlertPartial): string {
  const lines: string[] = ['<b>Confirm new alert</b>'];
  if (p.pair) lines.push(`Pair: <code>${p.pair}</code>`);
  if (p.ruleType) lines.push(`Type: ${p.ruleType}`);
  if (p.ruleType === 'threshold') {
    if (p.thresholdTarget) lines.push(`Target: ${p.thresholdTarget}`);
    if (p.thresholdOp) lines.push(`Op: ${p.thresholdOp === 'gt' ? '>' : '<'}`);
    if (p.thresholdValue != null) lines.push(`Value: <code>${p.thresholdValue}</code>`);
  }
  if (p.ruleType === 'interval' && p.intervalSeconds != null) {
    lines.push(`Interval: ${humanInterval(p.intervalSeconds)}`);
  }
  if (p.cooldownSeconds != null) lines.push(`Cooldown: ${humanCooldown(p.cooldownSeconds)}`);
  return lines.join('\n');
}

export async function startNewAlert(chatId: string): Promise<void> {
  clearWizard(chatId);
  const promptMessageId = await showStep(
    chatId,
    undefined,
    '<b>New alert</b>\nWhich currency pair?',
    pairButtons(),
  );
  setWizard(chatId, {
    name: 'newAlert',
    step: 'pair',
    partial: {},
    promptMessageId,
    updatedAt: Date.now(),
  });
}

export async function handleCallback(chatId: string, data: string): Promise<void> {
  const w = getWizard(chatId);
  if (!w || w.name !== 'newAlert') return;

  const parts = data.split(':');
  if (parts[0] !== 'wiz') return;

  if (parts[1] === 'cancel') {
    if (w.promptMessageId != null) {
      await editMessageText({
        chatId,
        messageId: w.promptMessageId,
        text: '✖ Cancelled.',
      });
    }
    clearWizard(chatId);
    return;
  }

  // Pair
  if (parts[1] === 'pair' && parts[2]) {
    w.partial.pair = parts[2];
    w.step = 'ruleType';
    w.promptMessageId = await showStep(
      chatId,
      w.promptMessageId,
      `Pair: <code>${w.partial.pair}</code>\nRule type?`,
      ruleTypeButtons(),
    );
    setWizard(chatId, w);
    return;
  }

  // Rule type
  if (parts[1] === 'type') {
    if (parts[2] === 'threshold') {
      w.partial.ruleType = 'threshold';
      w.step = 'target';
      w.promptMessageId = await showStep(
        chatId,
        w.promptMessageId,
        `${summary(w.partial)}\n\nThreshold target?`,
        targetButtons(),
      );
    } else if (parts[2] === 'interval') {
      w.partial.ruleType = 'interval';
      w.step = 'interval';
      w.promptMessageId = await showStep(
        chatId,
        w.promptMessageId,
        `${summary(w.partial)}\n\nDigest interval?`,
        intervalButtons(),
      );
    }
    setWizard(chatId, w);
    return;
  }

  // Threshold target
  if (parts[1] === 'target' && (parts[2] === 'mid_market' || parts[2] === 'best_effective')) {
    w.partial.thresholdTarget = parts[2];
    w.step = 'op';
    w.promptMessageId = await showStep(
      chatId,
      w.promptMessageId,
      `${summary(w.partial)}\n\nOperator?`,
      opButtons(),
    );
    setWizard(chatId, w);
    return;
  }

  // Threshold op
  if (parts[1] === 'op' && (parts[2] === 'gt' || parts[2] === 'lt')) {
    w.partial.thresholdOp = parts[2];
    w.partial.awaitingTextFor = 'thresholdValue';
    w.step = 'thresholdValue';
    w.promptMessageId = await showStep(
      chatId,
      w.promptMessageId,
      `${summary(w.partial)}\n\nReply with the threshold value (e.g. <code>23.50</code>).`,
      [[{ text: '✖ Cancel', callback_data: 'wiz:cancel' }]],
    );
    setWizard(chatId, w);
    return;
  }

  // Cooldown preset / custom
  if (parts[1] === 'cd') {
    if (parts[2] === 'custom') {
      w.partial.awaitingTextFor = 'cooldownSeconds';
      w.step = 'cooldownCustom';
      w.promptMessageId = await showStep(
        chatId,
        w.promptMessageId,
        `${summary(w.partial)}\n\nReply with cooldown in seconds (min 60).`,
        [[{ text: '✖ Cancel', callback_data: 'wiz:cancel' }]],
      );
      setWizard(chatId, w);
      return;
    }
    const secs = parseInt(parts[2] ?? '', 10);
    if (Number.isFinite(secs) && secs >= 60) {
      w.partial.cooldownSeconds = secs;
      w.step = 'confirm';
      w.promptMessageId = await showStep(
        chatId,
        w.promptMessageId,
        summary(w.partial),
        confirmButtons(),
      );
      setWizard(chatId, w);
    }
    return;
  }

  // Interval preset / custom
  if (parts[1] === 'int') {
    if (parts[2] === 'custom') {
      w.partial.awaitingTextFor = 'intervalSeconds';
      w.step = 'intervalCustom';
      w.promptMessageId = await showStep(
        chatId,
        w.promptMessageId,
        `${summary(w.partial)}\n\nReply with the interval in seconds (min 60).`,
        [[{ text: '✖ Cancel', callback_data: 'wiz:cancel' }]],
      );
      setWizard(chatId, w);
      return;
    }
    const secs = parseInt(parts[2] ?? '', 10);
    if (Number.isFinite(secs) && secs >= 60) {
      w.partial.intervalSeconds = secs;
      w.partial.cooldownSeconds = secs;
      w.step = 'confirm';
      w.promptMessageId = await showStep(
        chatId,
        w.promptMessageId,
        summary(w.partial),
        confirmButtons(),
      );
      setWizard(chatId, w);
    }
    return;
  }

  // Confirm
  if (parts[1] === 'confirm') {
    await finalize(chatId, w.promptMessageId, w.partial);
    clearWizard(chatId);
    return;
  }
}

export async function handleText(chatId: string, text: string): Promise<boolean> {
  const w = getWizard(chatId);
  if (!w || w.name !== 'newAlert' || !w.partial.awaitingTextFor) return false;

  const trimmed = text.trim();
  const awaiting = w.partial.awaitingTextFor;

  if (awaiting === 'thresholdValue') {
    const n = parseFloat(trimmed);
    if (!Number.isFinite(n) || n <= 0) {
      await sendMessage({
        chatId,
        text: 'Please reply with a positive number (e.g. 23.50).',
      });
      return true;
    }
    w.partial.thresholdValue = n;
    w.partial.awaitingTextFor = undefined;
    w.step = 'cooldown';
    w.promptMessageId = await showStep(
      chatId,
      w.promptMessageId,
      `${summary(w.partial)}\n\nCooldown?`,
      cooldownButtons(),
    );
    setWizard(chatId, w);
    return true;
  }

  if (awaiting === 'cooldownSeconds') {
    const n = parseInt(trimmed, 10);
    if (!Number.isFinite(n) || n < 60) {
      await sendMessage({ chatId, text: 'Please reply with an integer ≥ 60.' });
      return true;
    }
    w.partial.cooldownSeconds = n;
    w.partial.awaitingTextFor = undefined;
    w.step = 'confirm';
    w.promptMessageId = await showStep(
      chatId,
      w.promptMessageId,
      summary(w.partial),
      confirmButtons(),
    );
    setWizard(chatId, w);
    return true;
  }

  if (awaiting === 'intervalSeconds') {
    const n = parseInt(trimmed, 10);
    if (!Number.isFinite(n) || n < 60) {
      await sendMessage({ chatId, text: 'Please reply with an integer ≥ 60.' });
      return true;
    }
    w.partial.intervalSeconds = n;
    w.partial.cooldownSeconds = n;
    w.partial.awaitingTextFor = undefined;
    w.step = 'confirm';
    w.promptMessageId = await showStep(
      chatId,
      w.promptMessageId,
      summary(w.partial),
      confirmButtons(),
    );
    setWizard(chatId, w);
    return true;
  }

  return false;
}

async function finalize(
  chatId: string,
  promptMessageId: number | undefined,
  p: NewAlertPartial,
): Promise<void> {
  if (!p.pair || !p.ruleType) {
    await sendMessage({ chatId, text: '⚠ Wizard incomplete; run /newalert again.' });
    return;
  }
  // Default referenceAmount (best_effective rules) from providers.yml.
  const cfg = providers();
  const pairCfg = cfg.pairs[p.pair];
  const referenceAmount = pairCfg?.referenceAmounts[0];

  const name = deriveRuleName({
    pair: p.pair,
    ruleType: p.ruleType,
    thresholdTarget: p.thresholdTarget,
    thresholdOp: p.thresholdOp,
    thresholdValue: p.thresholdValue,
    intervalSeconds: p.intervalSeconds,
  });

  try {
    const { id } = await createAlertRule({
      name,
      pair: p.pair,
      ruleType: p.ruleType,
      intervalSeconds: p.intervalSeconds,
      thresholdOp: p.thresholdOp,
      thresholdValue: p.thresholdValue,
      thresholdTarget: p.thresholdTarget,
      referenceAmount: p.thresholdTarget === 'best_effective' ? referenceAmount : undefined,
      telegramChatId: chatId,
      cooldownSeconds: p.cooldownSeconds ?? 3600,
      enabled: true,
    });
    const text = `✅ Created rule <b>#${id}</b>\n${name}`;
    if (promptMessageId != null) {
      await editMessageText({ chatId, messageId: promptMessageId, text, parseMode: 'HTML' });
    } else {
      await sendMessage({ chatId, text, parseMode: 'HTML' });
    }
  } catch (err) {
    const msg = err instanceof RuleValidationError ? err.issues.join('\n') : String(err);
    logger.error({ err: msg }, 'createAlertRule failed from bot wizard');
    if (promptMessageId != null) {
      await editMessageText({
        chatId,
        messageId: promptMessageId,
        text: `⚠ Could not create rule:\n${msg}`,
      });
    } else {
      await sendMessage({ chatId, text: `⚠ Could not create rule:\n${msg}` });
    }
  }
}
