import type { ListedAlertRule } from '../alerts/ruleCommands.js';
import { htmlEscape } from './api.js';

export function humanCooldown(seconds: number): string {
  if (seconds % 86400 === 0) return `${seconds / 86400}d`;
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

export function humanInterval(seconds: number): string {
  return humanCooldown(seconds);
}

export function deriveRuleName(opts: {
  pair: string;
  ruleType: 'threshold' | 'interval';
  thresholdTarget?: 'mid_market' | 'best_effective';
  thresholdOp?: 'gt' | 'lt';
  thresholdValue?: number;
  intervalSeconds?: number;
}): string {
  if (opts.ruleType === 'threshold') {
    const target = opts.thresholdTarget === 'best_effective' ? 'best' : 'mid';
    const op = opts.thresholdOp === 'gt' ? '>' : '<';
    return `${opts.pair} ${target} ${op} ${opts.thresholdValue}`;
  }
  return `${opts.pair} interval ${humanInterval(opts.intervalSeconds ?? 0)}`;
}

export function formatRuleLine(r: ListedAlertRule): string {
  const pair = `${r.fromCode}-${r.toCode}`;
  const trigger =
    r.ruleType === 'threshold'
      ? `${r.thresholdTarget === 'best_effective' ? 'best' : 'mid'} ${
          r.thresholdOp === 'gt' ? '>' : '<'
        } ${r.thresholdValue}`
      : `every ${humanInterval(r.intervalSeconds ?? 0)}`;
  const status = r.enabled ? '✅ enabled' : '🚫 disabled';
  const cd = humanCooldown(r.cooldownSeconds);
  return `<b>#${r.id}</b>  ${htmlEscape(pair)}  •  ${htmlEscape(trigger)}  •  cd ${cd}  •  ${status}`;
}
