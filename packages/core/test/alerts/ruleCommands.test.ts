import { describe, it, expect, beforeEach, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  dbState: {
    inserts: [] as Array<{ values: Record<string, unknown> }>,
    deletes: [] as number[],
  },
  armMock: vi.fn(async (_id: number) => {}),
}));

vi.mock('../../src/db/client.js', () => ({
  getDb: () => ({
    insert: () => ({
      values: (v: Record<string, unknown>) => ({
        returning: async () => {
          hoisted.dbState.inserts.push({ values: v });
          return [{ id: hoisted.dbState.inserts.length }];
        },
      }),
    }),
    update: () => ({ set: () => ({ where: async () => {} }) }),
    delete: () => ({
      where: async () => {
        hoisted.dbState.deletes.push(1);
      },
    }),
    select: () => ({
      from: () => ({
        leftJoin: () => ({
          where: () => ({ limit: async () => [] }),
          orderBy: () => ({ limit: () => ({ offset: async () => [] }) }),
        }),
      }),
    }),
  }),
}));

vi.mock('../../src/db/pairs.js', () => ({
  ensurePairId: async () => 7,
}));

vi.mock('../../src/alerts/evaluator.js', () => ({
  armRuleAtCurrentSide: hoisted.armMock,
}));

import {
  createAlertRule,
  RuleValidationError,
  setAlertEnabled,
  deleteAlertRule,
} from '../../src/alerts/ruleCommands.js';

describe('alerts/ruleCommands', () => {
  beforeEach(() => {
    hoisted.dbState.inserts = [];
    hoisted.dbState.deletes = [];
    hoisted.armMock.mockClear();
  });

  it('creates a threshold rule and arms it', async () => {
    const { id } = await createAlertRule({
      name: 'AED-INR mid > 23.5',
      pair: 'AED-INR',
      ruleType: 'threshold',
      thresholdOp: 'gt',
      thresholdValue: 23.5,
      thresholdTarget: 'mid_market',
      telegramChatId: '111',
      cooldownSeconds: 3600,
    });
    expect(id).toBe(1);
    expect(hoisted.dbState.inserts[0]!.values).toMatchObject({
      name: 'AED-INR mid > 23.5',
      pairId: 7,
      ruleType: 'threshold',
      thresholdOp: 'gt',
      thresholdValue: '23.5',
      telegramChatId: '111',
    });
    expect(hoisted.armMock).toHaveBeenCalledWith(1);
  });

  it('creates an interval rule WITHOUT arming', async () => {
    await createAlertRule({
      name: 'USD-INR digest',
      pair: 'USD-INR',
      ruleType: 'interval',
      intervalSeconds: 3600,
      telegramChatId: '111',
    });
    expect(hoisted.armMock).not.toHaveBeenCalled();
  });

  it('rejects threshold rule missing required fields', async () => {
    await expect(
      createAlertRule({
        name: 'broken',
        pair: 'AED-INR',
        ruleType: 'threshold',
        // op + value + target missing
        telegramChatId: '111',
      } as Parameters<typeof createAlertRule>[0]),
    ).rejects.toBeInstanceOf(RuleValidationError);
    expect(hoisted.dbState.inserts).toHaveLength(0);
  });

  it('rejects interval rule with intervalSeconds < 60', async () => {
    await expect(
      createAlertRule({
        name: 'too short',
        pair: 'AED-INR',
        ruleType: 'interval',
        intervalSeconds: 10,
        telegramChatId: '111',
      }),
    ).rejects.toBeInstanceOf(RuleValidationError);
  });

  it('setAlertEnabled and deleteAlertRule call DB without throwing', async () => {
    await expect(setAlertEnabled(1, false)).resolves.toBeUndefined();
    await expect(deleteAlertRule(1)).resolves.toBeUndefined();
    expect(hoisted.dbState.deletes).toHaveLength(1);
  });
});
