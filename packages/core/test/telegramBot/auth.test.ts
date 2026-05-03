import { describe, it, expect, beforeEach, vi } from 'vitest';

// Stub the DB module before importing auth.
const dbCalls = {
  inserts: [] as Array<unknown>,
  deletes: [] as string[],
  authorizedRows: [] as Array<{ chatId: string }>,
};

vi.mock('../../src/db/client.js', () => ({
  getDb: () => ({
    insert: () => ({
      values: (v: unknown) => ({
        onConflictDoUpdate: async () => {
          dbCalls.inserts.push(v);
        },
      }),
    }),
    delete: () => ({
      where: async () => {
        // captured via the surrounding test setup
      },
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => dbCalls.authorizedRows,
        }),
      }),
    }),
    update: () => ({ set: () => ({ where: async () => {} }) }),
  }),
}));

import {
  tryLogin,
  isAuthorized,
  _resetAuthRateLimit,
} from '../../src/telegramBot/auth.js';

describe('telegramBot/auth', () => {
  beforeEach(() => {
    _resetAuthRateLimit();
    dbCalls.inserts = [];
    dbCalls.authorizedRows = [];
    process.env.TELEGRAM_BOT_PIN = '1104';
  });

  it('rejects when no PIN env set', async () => {
    delete process.env.TELEGRAM_BOT_PIN;
    const result = await tryLogin('1', '1104');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('no_pin_set');
  });

  it('accepts the correct PIN and persists chat', async () => {
    const result = await tryLogin('111', '1104');
    expect(result.ok).toBe(true);
    expect(dbCalls.inserts).toHaveLength(1);
  });

  it('rejects the wrong PIN without persisting', async () => {
    const result = await tryLogin('111', '0000');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('wrong_pin');
    expect(dbCalls.inserts).toHaveLength(0);
  });

  it('locks out after 3 failed attempts', async () => {
    await tryLogin('222', 'x');
    await tryLogin('222', 'x');
    const third = await tryLogin('222', 'x');
    expect(third.ok).toBe(false);
    if (!third.ok) expect(third.reason).toBe('locked');
    // Even a correct PIN is now rejected with `locked`.
    const correct = await tryLogin('222', '1104');
    expect(correct.ok).toBe(false);
    if (!correct.ok) expect(correct.reason).toBe('locked');
  });

  it('lockout is per-chat', async () => {
    await tryLogin('333', 'x');
    await tryLogin('333', 'x');
    await tryLogin('333', 'x');
    const otherChat = await tryLogin('444', '1104');
    expect(otherChat.ok).toBe(true);
  });

  it('isAuthorized reflects DB state', async () => {
    dbCalls.authorizedRows = [];
    expect(await isAuthorized('999')).toBe(false);
    dbCalls.authorizedRows = [{ chatId: '999' }];
    expect(await isAuthorized('999')).toBe(true);
  });
});
