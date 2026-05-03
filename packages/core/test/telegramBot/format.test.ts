import { describe, it, expect } from 'vitest';
import {
  deriveRuleName,
  formatRuleLine,
  humanCooldown,
  humanInterval,
} from '../../src/telegramBot/format.js';

describe('telegramBot/format', () => {
  it('humanCooldown', () => {
    expect(humanCooldown(60)).toBe('1m');
    expect(humanCooldown(3600)).toBe('1h');
    expect(humanCooldown(14400)).toBe('4h');
    expect(humanCooldown(86400)).toBe('1d');
    expect(humanCooldown(172800)).toBe('2d');
    expect(humanCooldown(45)).toBe('45s');
  });

  it('humanInterval mirrors humanCooldown', () => {
    expect(humanInterval(3600)).toBe('1h');
  });

  it('deriveRuleName threshold', () => {
    expect(
      deriveRuleName({
        pair: 'AED-INR',
        ruleType: 'threshold',
        thresholdTarget: 'mid_market',
        thresholdOp: 'gt',
        thresholdValue: 23.5,
      }),
    ).toBe('AED-INR mid > 23.5');

    expect(
      deriveRuleName({
        pair: 'USD-INR',
        ruleType: 'threshold',
        thresholdTarget: 'best_effective',
        thresholdOp: 'lt',
        thresholdValue: 84.1,
      }),
    ).toBe('USD-INR best < 84.1');
  });

  it('deriveRuleName interval', () => {
    expect(
      deriveRuleName({
        pair: 'AED-INR',
        ruleType: 'interval',
        intervalSeconds: 21600,
      }),
    ).toBe('AED-INR interval 6h');
  });

  it('formatRuleLine renders enabled threshold', () => {
    const line = formatRuleLine({
      id: 42,
      name: 'AED-INR mid > 23.5',
      pairId: 1,
      enabled: true,
      ruleType: 'threshold',
      intervalSeconds: null,
      thresholdOp: 'gt',
      thresholdValue: '23.5',
      thresholdTarget: 'mid_market',
      referenceAmount: null,
      telegramChatId: '111',
      cooldownSeconds: 3600,
      lastFiredAt: null,
      lastObservedSide: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      fromCode: 'AED',
      toCode: 'INR',
    });
    expect(line).toContain('#42');
    expect(line).toContain('AED-INR');
    expect(line).toContain('mid &gt; 23.5');
    expect(line).toContain('cd 1h');
    expect(line).toContain('enabled');
  });

  it('formatRuleLine renders disabled interval', () => {
    const line = formatRuleLine({
      id: 7,
      name: 'USD-INR digest',
      pairId: 1,
      enabled: false,
      ruleType: 'interval',
      intervalSeconds: 86400,
      thresholdOp: null,
      thresholdValue: null,
      thresholdTarget: null,
      referenceAmount: null,
      telegramChatId: '111',
      cooldownSeconds: 86400,
      lastFiredAt: null,
      lastObservedSide: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      fromCode: 'USD',
      toCode: 'INR',
    });
    expect(line).toContain('every 1d');
    expect(line).toContain('disabled');
  });
});
