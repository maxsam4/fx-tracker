import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  getWizard,
  setWizard,
  clearWizard,
  startWizardTtlSweeper,
  stopWizardTtlSweeper,
  _allWizardsForTest,
} from '../../src/telegramBot/state.js';

describe('telegramBot/state', () => {
  beforeEach(() => {
    for (const k of [..._allWizardsForTest().keys()]) clearWizard(k);
    vi.useRealTimers();
  });
  afterEach(() => {
    stopWizardTtlSweeper();
    vi.useRealTimers();
  });

  it('round-trips wizard state', () => {
    setWizard('123', { name: 'newAlert', step: 'pair', partial: {}, updatedAt: 0 });
    expect(getWizard('123')?.step).toBe('pair');
  });

  it('isolates state per chatId', () => {
    setWizard('a', { name: 'newAlert', step: 'pair', partial: { pair: 'X' }, updatedAt: 0 });
    setWizard('b', { name: 'newAlert', step: 'op', partial: { pair: 'Y' }, updatedAt: 0 });
    expect(getWizard('a')?.partial.pair).toBe('X');
    expect(getWizard('b')?.partial.pair).toBe('Y');
  });

  it('clearWizard removes state', () => {
    setWizard('123', { name: 'newAlert', step: 'pair', partial: {}, updatedAt: 0 });
    clearWizard('123');
    expect(getWizard('123')).toBeUndefined();
  });

  it('drops state after TTL on read', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    setWizard('123', { name: 'newAlert', step: 'pair', partial: {}, updatedAt: 0 });
    expect(getWizard('123')).toBeDefined();
    vi.setSystemTime(new Date('2026-01-01T00:11:00Z')); // > 10 min later
    expect(getWizard('123')).toBeUndefined();
  });

  it('sweeper clears expired entries on its tick', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    setWizard('123', { name: 'newAlert', step: 'pair', partial: {}, updatedAt: 0 });
    startWizardTtlSweeper();
    vi.setSystemTime(new Date('2026-01-01T00:11:00Z'));
    vi.advanceTimersByTime(60_000);
    expect(_allWizardsForTest().has('123')).toBe(false);
  });
});
