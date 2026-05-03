import { describe, it, expect, beforeEach, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  sentMessages: [] as Array<{ chatId: string | number; text: string }>,
  apiMock: {
    sendMessage: vi.fn<(opts: { chatId: string | number; text: string }) => Promise<{ message_id: number; chat: { id: number; type: string }; date: number }>>(),
    editMessageText: vi.fn(async () => true),
    answerCallbackQuery: vi.fn(async () => {}),
  },
  authMock: {
    tryLogin: vi.fn<(chatId: string, pin: string) => Promise<{ ok: true } | { ok: false; reason: 'wrong_pin' | 'locked' | 'no_pin_set' }>>(),
    isAuthorized: vi.fn<(chatId: string) => Promise<boolean>>(),
    logout: vi.fn(async () => {}),
    touchLastSeen: vi.fn(async () => {}),
  },
  newAlertMock: {
    startNewAlert: vi.fn(async (_chatId: string) => {}),
    handleCallback: vi.fn(async () => {}),
    handleText: vi.fn<(chatId: string, text: string) => Promise<boolean>>(),
  },
  listAlertsMock: {
    showList: vi.fn(async (_chatId: string, _page: number) => {}),
    handleCallback: vi.fn(async () => {}),
  },
}));

hoisted.apiMock.sendMessage.mockImplementation(async (opts) => {
  hoisted.sentMessages.push({ chatId: opts.chatId, text: opts.text });
  return { message_id: 1, chat: { id: 0, type: 'private' }, date: 0 };
});

vi.mock('../../src/telegramBot/api.js', () => ({
  sendMessage: hoisted.apiMock.sendMessage,
  editMessageText: hoisted.apiMock.editMessageText,
  answerCallbackQuery: hoisted.apiMock.answerCallbackQuery,
  htmlEscape: (s: string) => s,
}));

vi.mock('../../src/telegramBot/auth.js', () => hoisted.authMock);
vi.mock('../../src/telegramBot/wizards/newAlert.js', () => hoisted.newAlertMock);
vi.mock('../../src/telegramBot/wizards/listAlerts.js', () => hoisted.listAlertsMock);

import { handleUpdate } from '../../src/telegramBot/router.js';

const sentMessages = hoisted.sentMessages;
const apiMock = hoisted.apiMock;
const authMock = hoisted.authMock;
const newAlertMock = hoisted.newAlertMock;
const listAlertsMock = hoisted.listAlertsMock;

function msg(chatId: number, text: string) {
  return {
    update_id: 1,
    message: {
      message_id: 1,
      chat: { id: chatId, type: 'private' as const },
      date: 0,
      text,
    },
  };
}

describe('telegramBot/router', () => {
  beforeEach(() => {
    sentMessages.length = 0;
    apiMock.sendMessage.mockClear();
    apiMock.editMessageText.mockClear();
    authMock.tryLogin.mockReset();
    authMock.isAuthorized.mockReset();
    newAlertMock.startNewAlert.mockReset();
    newAlertMock.handleText.mockReset();
    newAlertMock.handleText.mockResolvedValue(false);
    listAlertsMock.showList.mockReset();
  });

  it('/start replies even when not authorized', async () => {
    authMock.isAuthorized.mockResolvedValue(false);
    await handleUpdate(msg(123, '/start'));
    expect(apiMock.sendMessage).toHaveBeenCalled();
  });

  it('/login OK persists and replies', async () => {
    authMock.isAuthorized.mockResolvedValue(false);
    authMock.tryLogin.mockResolvedValue({ ok: true });
    await handleUpdate(msg(123, '/login 1104'));
    expect(authMock.tryLogin).toHaveBeenCalledWith('123', '1104');
    expect(sentMessages.at(-1)?.text).toContain('Authenticated');
  });

  it('/login wrong PIN replies with error', async () => {
    authMock.isAuthorized.mockResolvedValue(false);
    authMock.tryLogin.mockResolvedValue({ ok: false, reason: 'wrong_pin' });
    await handleUpdate(msg(123, '/login 0000'));
    expect(sentMessages.at(-1)?.text).toMatch(/Wrong/i);
  });

  it('/login locked replies with rate-limit message', async () => {
    authMock.isAuthorized.mockResolvedValue(false);
    authMock.tryLogin.mockResolvedValue({ ok: false, reason: 'locked' });
    await handleUpdate(msg(123, '/login 1104'));
    expect(sentMessages.at(-1)?.text).toMatch(/Too many/);
  });

  it('drops unknown command from non-authorized chat silently', async () => {
    authMock.isAuthorized.mockResolvedValue(false);
    await handleUpdate(msg(123, '/newalert'));
    expect(apiMock.sendMessage).not.toHaveBeenCalled();
    expect(newAlertMock.startNewAlert).not.toHaveBeenCalled();
  });

  it('/newalert from authorized chat starts wizard', async () => {
    authMock.isAuthorized.mockResolvedValue(true);
    await handleUpdate(msg(123, '/newalert'));
    expect(newAlertMock.startNewAlert).toHaveBeenCalledWith('123');
  });

  it('/alerts from authorized chat shows list', async () => {
    authMock.isAuthorized.mockResolvedValue(true);
    await handleUpdate(msg(123, '/alerts'));
    expect(listAlertsMock.showList).toHaveBeenCalledWith('123', 0);
  });

  it('routes free text to active wizard handler', async () => {
    authMock.isAuthorized.mockResolvedValue(true);
    newAlertMock.handleText.mockResolvedValue(true);
    await handleUpdate(msg(123, '23.5'));
    expect(newAlertMock.handleText).toHaveBeenCalledWith('123', '23.5');
    expect(apiMock.sendMessage).not.toHaveBeenCalled();
  });

  it('replies "unknown command" for free text with no active wizard', async () => {
    authMock.isAuthorized.mockResolvedValue(true);
    newAlertMock.handleText.mockResolvedValue(false);
    await handleUpdate(msg(123, 'hello'));
    expect(sentMessages.at(-1)?.text).toMatch(/Unknown command/);
  });
});
