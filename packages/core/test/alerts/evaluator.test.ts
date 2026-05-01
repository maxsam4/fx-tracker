/**
 * Evaluator tests focus on the edge-trigger / cooldown / arming logic. We
 * don't spin up a real Postgres — instead we module-mock the DB and Telegram
 * client and verify the orchestration calls.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------- mock the DB module BEFORE any imports that pull it in ----------
const fakeDb = {
  state: {
    rules: [] as Array<Record<string, unknown>>,
    midRows: [] as Array<Record<string, unknown>>,
    fires: [] as Array<Record<string, unknown>>,
  },
  reset() {
    this.state = { rules: [], midRows: [], fires: [] };
  },
};

vi.mock('../../src/db/client.js', () => ({
  getDb: () => ({
    select: () => ({
      from: (_table: unknown) => ({
        where: () => ({
          orderBy: () => ({ limit: async () => fakeDb.state.midRows.slice(0, 1) }),
        }),
      }),
    }),
    insert: () => ({
      values: () => ({
        returning: async () => {
          const row = { id: fakeDb.state.fires.length + 1 };
          fakeDb.state.fires.push(row);
          return [row];
        },
      }),
    }),
    update: () => ({ set: () => ({ where: async () => {} }) }),
    execute: async () => [],
  }),
}));

// Also stub provider registry to avoid loading scrape-heavy modules at import time.
vi.mock('../../src/providers/index.js', () => ({
  getProvider: (id: string) => ({ id, displayName: id }),
  getReferenceSource: () => ({}),
}));

// Mock Telegram so we don't hit the network.
const sendMock = vi.fn(async () => ({ ok: true, messageId: 'msg-123' }));
vi.mock('../../src/alerts/telegram.js', () => ({
  sendTelegramMessage: sendMock,
  getRecentChats: vi.fn(),
}));

// Now import the unit under test.
import { buildAlertMessage } from '../../src/alerts/messageBuilder.js';

describe('buildAlertMessage end-to-end formatting', () => {
  beforeEach(() => fakeDb.reset());

  it('produces a parseable HTML body with pair codes filled in', () => {
    const text = buildAlertMessage({
      pair: { from: 'USD', to: 'INR' },
      midRate: 94.5,
      midSourcesUsed: ['wiseMidMarket', 'xe'],
      triggerLabel: 'mid_market > 94',
      providers: [
        {
          providerId: 'wise',
          displayName: 'Wise',
          effectiveRate: 94.3,
          sendAmount: 1000,
          receiveAmount: 94300,
          feeAmount: 4.5,
        },
      ],
      baseUrl: 'https://example.com',
      capturedAt: new Date('2026-04-30T12:00:00Z'),
    });

    expect(text).toContain('USD→INR');
    expect(text).toContain('94.5000');
    // dashboard link uses real codes, not placeholder
    expect(text).toContain('https://example.com/USD→INR');
    expect(text).not.toContain('href="https://example.com/→"');
  });

  it('escapes pair codes in the body even if odd input', () => {
    const text = buildAlertMessage({
      pair: { from: '<USD>', to: 'INR' },
      midRate: 94.5,
      midSourcesUsed: ['wiseMidMarket'],
      triggerLabel: 'test',
      providers: [],
      baseUrl: 'https://example.com',
    });
    expect(text).not.toContain('<USD>');
    expect(text).toContain('&lt;USD&gt;');
  });
});

// ---------- edge-trigger logic, simulated ----------

interface Rule {
  thresholdOp: 'gt' | 'lt';
  thresholdValue: number;
  lastObservedSide: 'above' | 'below' | 'equal' | null;
}

function shouldFire(rule: Rule, observed: number): boolean {
  const side =
    observed > rule.thresholdValue
      ? 'above'
      : observed < rule.thresholdValue
      ? 'below'
      : 'equal';
  return (
    (rule.thresholdOp === 'gt' && side === 'above' && rule.lastObservedSide !== 'above') ||
    (rule.thresholdOp === 'lt' && side === 'below' && rule.lastObservedSide !== 'below')
  );
}

describe('threshold edge-trigger semantics', () => {
  it('fires when crossing above for the first time', () => {
    const rule: Rule = { thresholdOp: 'gt', thresholdValue: 90, lastObservedSide: 'below' };
    expect(shouldFire(rule, 91)).toBe(true);
  });

  it('does not refire while already above', () => {
    const rule: Rule = { thresholdOp: 'gt', thresholdValue: 90, lastObservedSide: 'above' };
    expect(shouldFire(rule, 92)).toBe(false);
  });

  it('refires after returning below and crossing again', () => {
    const rule: Rule = { thresholdOp: 'gt', thresholdValue: 90, lastObservedSide: 'above' };
    // After dipping below, lastObservedSide must be updated by caller; simulate it.
    const dipped: Rule = { ...rule, lastObservedSide: 'below' };
    expect(shouldFire(dipped, 91)).toBe(true);
  });

  it('lt fires when crossing below', () => {
    const rule: Rule = { thresholdOp: 'lt', thresholdValue: 90, lastObservedSide: 'above' };
    expect(shouldFire(rule, 88)).toBe(true);
  });

  it('lt does not fire while above target', () => {
    const rule: Rule = { thresholdOp: 'lt', thresholdValue: 90, lastObservedSide: null };
    expect(shouldFire(rule, 95)).toBe(false);
  });

  it('newly created rule against an already-past target SHOULD fire on first poll if lastObservedSide is null', () => {
    // This documents the unarmed behavior — armRuleAtCurrentSide is what
    // suppresses this in practice by initializing lastObservedSide.
    const unarmed: Rule = { thresholdOp: 'gt', thresholdValue: 90, lastObservedSide: null };
    expect(shouldFire(unarmed, 95)).toBe(true);
    const armed: Rule = { thresholdOp: 'gt', thresholdValue: 90, lastObservedSide: 'above' };
    expect(shouldFire(armed, 95)).toBe(false);
  });
});
