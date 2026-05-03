// Per-chat ephemeral wizard state. In-memory only — a worker restart drops
// in-progress wizards. Single admin, low volume; the trade-off is fine.

const TTL_MS = 10 * 60 * 1000;

export type WizardName = 'newAlert';

export interface NewAlertPartial {
  pair?: string;
  ruleType?: 'threshold' | 'interval';
  thresholdTarget?: 'mid_market' | 'best_effective';
  thresholdOp?: 'gt' | 'lt';
  thresholdValue?: number;
  intervalSeconds?: number;
  cooldownSeconds?: number;
  awaitingTextFor?: 'thresholdValue' | 'cooldownSeconds' | 'intervalSeconds';
}

export interface WizardState {
  name: WizardName;
  step: string;
  partial: NewAlertPartial;
  // The wizard message id we keep editing in place. Prevents chat clutter.
  promptMessageId?: number;
  updatedAt: number;
}

const states = new Map<string, WizardState>();

export function getWizard(chatId: string): WizardState | undefined {
  const s = states.get(chatId);
  if (!s) return undefined;
  if (Date.now() - s.updatedAt > TTL_MS) {
    states.delete(chatId);
    return undefined;
  }
  return s;
}

export function setWizard(chatId: string, state: WizardState): void {
  state.updatedAt = Date.now();
  states.set(chatId, state);
}

export function clearWizard(chatId: string): void {
  states.delete(chatId);
}

export function _allWizardsForTest(): Map<string, WizardState> {
  return states;
}

let sweeperInterval: ReturnType<typeof setInterval> | null = null;

export function startWizardTtlSweeper(): void {
  if (sweeperInterval) return;
  sweeperInterval = setInterval(() => {
    const now = Date.now();
    for (const [chatId, s] of states) {
      if (now - s.updatedAt > TTL_MS) states.delete(chatId);
    }
  }, 60 * 1000);
  // Don't keep the process alive just for the sweeper.
  if (typeof sweeperInterval.unref === 'function') sweeperInterval.unref();
}

export function stopWizardTtlSweeper(): void {
  if (sweeperInterval) {
    clearInterval(sweeperInterval);
    sweeperInterval = null;
  }
}
