import { pctDelta } from '../utils/median.js';
import type { CurrencyPair } from '../types.js';

export interface ProviderSnapshot {
  providerId: string;
  displayName?: string;
  effectiveRate: number;       // receiveAmount / sendAmount
  sendAmount: number;
  receiveAmount: number;
  feeAmount: number;
}

export interface BuildAlertMessageInput {
  pair: CurrencyPair;
  midRate: number;
  midSourcesUsed: string[];
  triggerLabel: string;        // human-readable trigger description
  providers: ProviderSnapshot[];   // all providers being considered (will filter to within 1%)
  baseUrl: string;             // for the dashboard link
  withinPct?: number;          // default 1.0
  capturedAt?: Date;
}

const fmtRate = (r: number) => r.toFixed(4);
const fmtMoney = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

function formatIst(d: Date): string {
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

// HTML-safe escape for Telegram parse_mode=HTML
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function buildAlertMessage(input: BuildAlertMessageInput): string {
  const withinPct = input.withinPct ?? 1.0;
  const captured = input.capturedAt ?? new Date();

  const ranked = [...input.providers].sort((a, b) => b.effectiveRate - a.effectiveRate);
  const within = ranked.filter(
    (p) => Math.abs(pctDelta(p.effectiveRate, input.midRate)) <= withinPct,
  );

  const pairLabel = `${input.pair.from}→${input.pair.to}`;
  const lines: string[] = [];
  lines.push(`<b>${esc(pairLabel)}</b> — ${esc(input.triggerLabel)}`);
  lines.push('');
  lines.push(`<b>Mid-market:</b> ${fmtRate(input.midRate)}`);
  lines.push(`<i>sources: ${esc(input.midSourcesUsed.join(', '))}</i>`);
  lines.push('');

  if (within.length === 0) {
    lines.push(`<i>No providers within ${withinPct}% of mid-market right now.</i>`);
  } else {
    lines.push(`<b>Within ${withinPct}% of mid (${within.length}):</b>`);
    for (const p of within) {
      const delta = pctDelta(p.effectiveRate, input.midRate);
      const sign = delta >= 0 ? '+' : '';
      const name = esc(p.displayName ?? p.providerId);
      lines.push(
        `• <b>${name}</b> — ${fmtRate(p.effectiveRate)} (${sign}${delta.toFixed(2)}%) ` +
          `— send ${fmtMoney(p.sendAmount)} ${input.pair.from}, ` +
          `recv ${fmtMoney(p.receiveAmount)} ${input.pair.to}, ` +
          `fee ${fmtMoney(p.feeAmount)} ${input.pair.from}`,
      );
    }
  }

  lines.push('');
  lines.push(`<i>${formatIst(captured)} IST · ${captured.toISOString()}</i>`);
  const dashUrl = `${input.baseUrl.replace(/\/$/, '')}/${pairLabel}`;
  lines.push(`<a href="${esc(dashUrl)}">View dashboard</a>`);

  return lines.join('\n');
}
