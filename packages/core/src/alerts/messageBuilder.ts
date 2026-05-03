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
  lines.push(`Mid-market  <b>${fmtRate(input.midRate)}</b>`);
  lines.push('');

  if (within.length === 0) {
    lines.push(`<i>No providers within ${withinPct}% of mid-market.</i>`);
  } else {
    // Monospace block keeps vendor names + rates aligned on phones.
    const nameWidth = Math.max(
      ...within.map((p) => (p.displayName ?? p.providerId).length),
    );
    const rows = within.map((p) => {
      const name = (p.displayName ?? p.providerId).padEnd(nameWidth, ' ');
      return `${esc(name)}  ${fmtRate(p.effectiveRate)}`;
    });
    lines.push('<pre>' + rows.join('\n') + '</pre>');
  }

  lines.push('');
  lines.push(`<i>${formatIst(captured)} IST</i>`);
  const dashUrl = `${input.baseUrl.replace(/\/$/, '')}/${pairLabel}`;
  lines.push(`<a href="${esc(dashUrl)}">View dashboard</a>`);

  return lines.join('\n');
}
