import { describe, it, expect, beforeEach, vi } from 'vitest';
import { _allWizardsForTest, clearWizard } from '../../src/telegramBot/state.js';

interface SendOpts { chatId: string | number; text: string }
type CreateInput = Record<string, unknown>;

const hoisted = vi.hoisted(() => ({
  apiMock: {
    sendMessage: vi.fn<(opts: SendOpts) => Promise<{ message_id: number; chat: { id: number; type: 'private' }; date: number }>>(
      async () => ({
        message_id: 100,
        chat: { id: 0, type: 'private' as const },
        date: 0,
      }),
    ),
    editMessageText: vi.fn(async () => true),
    answerCallbackQuery: vi.fn(async () => {}),
  },
  createMock: vi.fn<(input: CreateInput) => Promise<{ id: number }>>(async () => ({ id: 42 })),
}));

vi.mock('../../src/telegramBot/api.js', () => ({
  sendMessage: hoisted.apiMock.sendMessage,
  editMessageText: hoisted.apiMock.editMessageText,
  answerCallbackQuery: hoisted.apiMock.answerCallbackQuery,
  htmlEscape: (s: string) => s,
}));

vi.mock('../../src/alerts/ruleCommands.js', () => ({
  createAlertRule: hoisted.createMock,
  RuleValidationError: class extends Error {
    issues: string[];
    constructor(issues: string[]) {
      super(issues.join('\n'));
      this.issues = issues;
    }
  },
}));

vi.mock('../../src/config/loadProviders.js', () => ({
  loadProvidersConfig: () => ({
    pairs: {
      'AED-INR': { enabled: true, referenceAmounts: [100000], providers: [], referenceSources: [] },
      'USD-INR': { enabled: true, referenceAmounts: [100000], providers: [], referenceSources: [] },
    },
    midMarket: { sources: [], referenceOnly: [], outlierTolerancePct: 2 },
    preferredSource: {},
  }),
}));

const apiMock = hoisted.apiMock;
const createMock = hoisted.createMock;

import {
  startNewAlert,
  handleCallback,
  handleText,
  _resetProvidersCacheForTest,
} from '../../src/telegramBot/wizards/newAlert.js';

describe('newAlert wizard', () => {
  beforeEach(() => {
    for (const k of [..._allWizardsForTest().keys()]) clearWizard(k);
    apiMock.sendMessage.mockClear();
    apiMock.editMessageText.mockClear();
    createMock.mockClear();
    _resetProvidersCacheForTest();
  });

  it('threshold happy path drives createAlertRule', async () => {
    await startNewAlert('111');
    expect(apiMock.sendMessage).toHaveBeenCalledTimes(1);

    await handleCallback('111', 'wiz:pair:AED-INR');
    await handleCallback('111', 'wiz:type:threshold');
    await handleCallback('111', 'wiz:target:mid_market');
    await handleCallback('111', 'wiz:op:gt');
    await handleText('111', '23.5');
    await handleCallback('111', 'wiz:cd:3600');
    await handleCallback('111', 'wiz:confirm');

    expect(createMock).toHaveBeenCalledTimes(1);
    const arg = createMock.mock.calls[0]![0];
    expect(arg.pair).toBe('AED-INR');
    expect(arg.ruleType).toBe('threshold');
    expect(arg.thresholdTarget).toBe('mid_market');
    expect(arg.thresholdOp).toBe('gt');
    expect(arg.thresholdValue).toBe(23.5);
    expect(arg.cooldownSeconds).toBe(3600);
    expect(arg.telegramChatId).toBe('111');
    expect(arg.name).toBe('AED-INR mid > 23.5');
  });

  it('best_effective threshold sets referenceAmount from providers.yml', async () => {
    await startNewAlert('111');
    await handleCallback('111', 'wiz:pair:AED-INR');
    await handleCallback('111', 'wiz:type:threshold');
    await handleCallback('111', 'wiz:target:best_effective');
    await handleCallback('111', 'wiz:op:lt');
    await handleText('111', '24.0');
    await handleCallback('111', 'wiz:cd:14400');
    await handleCallback('111', 'wiz:confirm');

    const arg = createMock.mock.calls[0]![0];
    expect(arg.referenceAmount).toBe(100000);
  });

  it('rejects non-numeric threshold value with a retry', async () => {
    await startNewAlert('111');
    await handleCallback('111', 'wiz:pair:AED-INR');
    await handleCallback('111', 'wiz:type:threshold');
    await handleCallback('111', 'wiz:target:mid_market');
    await handleCallback('111', 'wiz:op:gt');

    apiMock.sendMessage.mockClear();
    await handleText('111', 'not a number');
    expect(apiMock.sendMessage).toHaveBeenCalled();
    const last = apiMock.sendMessage.mock.calls.at(-1)![0];
    expect(last.text).toMatch(/positive number/i);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('cancel mid-wizard clears state and never calls createAlertRule', async () => {
    await startNewAlert('111');
    await handleCallback('111', 'wiz:pair:AED-INR');
    await handleCallback('111', 'wiz:cancel');
    expect(_allWizardsForTest().has('111')).toBe(false);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('interval path drives createAlertRule with intervalSeconds', async () => {
    await startNewAlert('111');
    await handleCallback('111', 'wiz:pair:USD-INR');
    await handleCallback('111', 'wiz:type:interval');
    await handleCallback('111', 'wiz:int:21600');
    await handleCallback('111', 'wiz:confirm');

    const arg = createMock.mock.calls[0]![0];
    expect(arg.ruleType).toBe('interval');
    expect(arg.intervalSeconds).toBe(21600);
    expect(arg.cooldownSeconds).toBe(21600);
    expect(arg.name).toBe('USD-INR interval 6h');
  });

  it('custom cooldown waits for free-text reply', async () => {
    await startNewAlert('111');
    await handleCallback('111', 'wiz:pair:AED-INR');
    await handleCallback('111', 'wiz:type:threshold');
    await handleCallback('111', 'wiz:target:mid_market');
    await handleCallback('111', 'wiz:op:gt');
    await handleText('111', '23.5');
    await handleCallback('111', 'wiz:cd:custom');
    await handleText('111', '7200');
    await handleCallback('111', 'wiz:confirm');

    const arg = createMock.mock.calls[0]![0];
    expect(arg.cooldownSeconds).toBe(7200);
  });
});
