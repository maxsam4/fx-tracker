import crypto from 'node:crypto';
import type { CurrencyPair } from '../types.js';
import type { RateProvider, Quote } from './types.js';
import { httpJson } from '../scrape/httpClient.js';

// Remitfinder is an aggregator that exposes a JSON API at
//   GET https://www.remitfinder.com/api/v1/rates/<ISO3-from>/<ISO3-to>
// returning rate quotes from many remittance providers (Ria, MoneyGram,
// WorldRemit, OFX, XE, CurrencyFair, ...). One call fans out into multiple
// Quotes — hence 'aggregator'.
//
// Auth: the endpoint requires four custom headers — `ai`, `av`, `ts`, `as`.
// The first three are constants pulled from the SPA's environment config;
// `as` is a per-request signature:
//   as = base64( asciiBytesOf( sha256_hex_lower( path + ts + at ) ) )
// where `path` is the request path *without* the `/api/` prefix
// (e.g. "v1/rates/USA/IND") and `at` is a static secret baked into the SPA.
// All three constants are world-readable in their JS bundle, so this is just
// a "no random scraper hits" filter, not real auth — but they DO enforce it
// (AED-INR returns 401 without it).

const API_BASE = 'https://www.remitfinder.com/api/';
const AT = 'A5zlaaXHWzABnlO4I9XLzh4r4e6z3SB6NbouVaw0aVg=';
const AI = 'WBST';
const AV = '1.0.1';

const COUNTRY_FOR_CURRENCY: Record<string, string> = { USD: 'USA', AED: 'ARE' };
const TARGET_COUNTRY = 'IND';

// Allowlist: remitfinder serviceProvider.name → our internal providerId.
// Only listed providers are emitted; everything else (including the long tail
// of niche FX brokers) is dropped silently. Providers that we ALREADY have
// direct API integrations for (wise, remitly, instarem, westernUnion, aspora,
// xoom) are explicitly NOT in this map — remitfinder is purely additive,
// surfacing brands the dashboard otherwise wouldn't see. In particular,
// remitfinder publishes Remitly's promo rate; we never want that path (see
// CLAUDE.md "Never fall back to the promo rate").
const NAME_TO_ID: Record<string, string> = {
  RIAMONEYTX: 'riaMoneyTransfer',
  MONEYGRAM: 'moneyGram',
  WORLDREMIT: 'worldRemit',
  OFX: 'ofx',
  XEMONEYTX: 'xeMoneyTransfer',
  CURRENCYFAIR: 'currencyFair',
  PANDAREMIT: 'pandaRemit',
  REVOLUT: 'revolut',
};

interface RemitfinderTier {
  lower: number | null;
  upper: number | null;
  rate: number;
}

interface RemitfinderResponse {
  latestFxRate: { rate: number };
  remitRateResultDTOs: Array<{
    serviceProvider: { name: string; longName: string };
    latestRemitRate: { tiers: RemitfinderTier[] };
  }>;
}

function signature(path: string, ts: string): string {
  const hex = crypto.createHash('sha256').update(path + ts + AT).digest('hex');
  return Buffer.from(hex, 'ascii').toString('base64');
}

// Pick the tier that applies at `amount`. Returns null if every tier caps
// below or starts above the amount — in that case the provider doesn't quote
// for this transfer size and we drop it for this poll.
function pickTier(tiers: RemitfinderTier[], amount: number): RemitfinderTier | null {
  for (const t of tiers) {
    const okLo = t.lower == null || amount >= t.lower;
    const okHi = t.upper == null || amount <= t.upper;
    if (okLo && okHi) return t;
  }
  return null;
}

export const remitfinderProvider: RateProvider = {
  id: 'remitfinder',
  displayName: 'Remitfinder (aggregator)',
  kind: 'aggregator',

  supports(pair: CurrencyPair) {
    return pair.to === 'INR' && pair.from in COUNTRY_FOR_CURRENCY;
  },

  async fetchQuote({ pair, sendAmount }): Promise<Quote[]> {
    const fromIso3 = COUNTRY_FOR_CURRENCY[pair.from];
    if (!fromIso3) throw new Error(`remitfinder: unsupported source currency ${pair.from}`);

    const path = `v1/rates/${fromIso3}/${TARGET_COUNTRY}`;
    const ts = String(Date.now());

    const data = await httpJson<RemitfinderResponse>(API_BASE + path, {
      headers: {
        Accept: 'application/json',
        ts,
        ai: AI,
        av: AV,
        as: signature(path, ts),
      },
      timeoutMs: 15_000,
    });

    const now = new Date();
    const out: Quote[] = [];
    for (const row of data.remitRateResultDTOs ?? []) {
      const name = row.serviceProvider?.name ?? '';
      const id = NAME_TO_ID[name];
      if (!id) continue;

      const tiers = row.latestRemitRate?.tiers ?? [];
      const tier = pickTier(tiers, sendAmount);
      if (!tier) continue;

      // Sanity guard against obviously-wrong rates (decimal slips, inverses).
      const rate = tier.rate;
      const inRange =
        pair.from === 'USD' ? rate > 60 && rate < 130 : rate > 18 && rate < 35;
      if (!inRange) continue;

      out.push({
        providerId: id,
        dataSource: 'remitfinder',
        pair,
        sendAmount,
        receiveAmount: sendAmount * rate,
        rate,
        // Remitfinder's tier shape doesn't carry a fee field — quotes here
        // are advertised exchange rate only. Direct providers (Wise, Aspora,
        // ...) are the right source when you need the all-in number.
        feeAmount: 0,
        capturedAt: now,
        raw: {
          source: 'remitfinder',
          longName: row.serviceProvider.longName,
          tier,
          allTiers: tiers,
        },
      });
    }

    if (out.length === 0) {
      throw new Error(
        `remitfinder API returned no allowlisted providers for ${pair.from}-${pair.to}`,
      );
    }
    return out;
  },
};
