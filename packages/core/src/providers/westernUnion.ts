import type { CurrencyPair } from '../types.js';
import type { RateProvider, Quote } from './types.js';
import { httpJson } from '../scrape/httpClient.js';

// Western Union exposes a public price-catalog endpoint (discovered via
// network capture from /us/en/currency-converter/usd-to-inr-rate.html and
// /ae/en/...):
//   POST https://www.westernunion.com/wuconnect/prices/catalog
//
// Body shape (sender side determines which corridor profile to use):
//   USD-INR (US online):  client=WUCOM, channel=WWEB, funds_in=AC
//   AED-INR (UAE retail): client=<AE agent code>, channel=WRET, funds_in=*
// The UAE corridor is retail-only — channel=WWEB returns
// "MISSING PRICING SETUP FOR THIS CHANNEL AND CLIENT".
// Multiple AE agent codes are interchangeable for pricing (verified
// AJ2090041 and AJ2090063 return identical rates); we use AJ2090041 as
// the primary and fall back to AJ2090063 if the first errors out.
//
// The response lists `services_groups` (Money-in-Minutes, Direct-to-Bank,
// ...) each with `pay_groups[].fx_rate` + `gross_fee`. Direct-to-Bank is
// the standard remittance path most senders use to India and consistently
// has the best rate with no fee, so we prefer it and fall through to
// whichever group offers the highest rate otherwise.

const ENDPOINT = 'https://www.westernunion.com/wuconnect/prices/catalog';

interface PriceCatalogPayGroup {
  fund_in: string;
  fx_rate: number;
  send_amount: number;
  receive_amount: number;
  gross_fee: number;
  base_fee?: number;
}

interface PriceCatalogServiceGroup {
  service: string;
  service_name: string;
  fund_out: string;
  fund_out_mnem: string;
  pay_groups: PriceCatalogPayGroup[];
}

interface PriceCatalogResponse {
  header_reply?: { response_type?: string };
  response_status?: { status: number; code: string; message: string };
  services_groups?: PriceCatalogServiceGroup[];
}

interface CorridorProfile {
  clients: string[];
  channel: 'WWEB' | 'WRET';
  funds_in: string;
  cty_iso2_ext: string;
  referer: string;
}

const PROFILES: Record<string, CorridorProfile> = {
  'USD-INR': {
    clients: ['WUCOM'],
    channel: 'WWEB',
    funds_in: 'AC',
    cty_iso2_ext: 'US',
    referer: 'https://www.westernunion.com/us/en/currency-converter/usd-to-inr-rate.html',
  },
  'AED-INR': {
    clients: ['AJ2090041', 'AJ2090063'],
    channel: 'WRET',
    funds_in: '*',
    cty_iso2_ext: 'AE',
    referer: 'https://www.westernunion.com/ae/en/currency-converter/aed-to-inr-rate.html',
  },
};

function pickBestPayGroup(
  groups: PriceCatalogServiceGroup[],
): { service: PriceCatalogServiceGroup; pay: PriceCatalogPayGroup } | null {
  let best: { service: PriceCatalogServiceGroup; pay: PriceCatalogPayGroup } | null = null;
  for (const svc of groups) {
    for (const pay of svc.pay_groups ?? []) {
      if (!Number.isFinite(pay.fx_rate) || pay.fx_rate <= 0) continue;
      if (!best || pay.fx_rate > best.pay.fx_rate) {
        best = { service: svc, pay };
      }
    }
  }
  return best;
}

async function fetchCatalog(
  pair: CurrencyPair,
  sendAmount: number,
  profile: CorridorProfile,
): Promise<PriceCatalogResponse> {
  let lastError: unknown;
  for (const client of profile.clients) {
    const body = {
      header_request: { version: '0.5', request_type: 'PRICECATALOG' },
      sender: {
        client,
        channel: profile.channel,
        funds_in: profile.funds_in,
        curr_iso3: pair.from,
        cty_iso2_ext: profile.cty_iso2_ext,
        send_amount: sendAmount.toFixed(2),
      },
      receiver: { curr_iso3: pair.to, cty_iso2_ext: 'IN', cty_iso2: 'IN' },
    };
    try {
      const data = await httpJson<PriceCatalogResponse>(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/plain, */*',
          Origin: 'https://www.westernunion.com',
          Referer: profile.referer,
        },
        body: JSON.stringify(body),
        timeoutMs: 15_000,
      });
      // status: 0 = OK, 1 = warning (still has data), -1 = error
      if (data.response_status && data.response_status.status < 0) {
        lastError = new Error(
          `Western Union API error (${data.response_status.code}): ${data.response_status.message}`,
        );
        continue;
      }
      return data;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error('Western Union: all clients failed');
}

export const westernUnionProvider: RateProvider = {
  id: 'westernUnion',
  displayName: 'Western Union',
  kind: 'api',

  supports(pair: CurrencyPair) {
    return Boolean(PROFILES[`${pair.from}-${pair.to}`]);
  },

  async fetchQuote({ pair, sendAmount }): Promise<Quote> {
    const profile = PROFILES[`${pair.from}-${pair.to}`];
    if (!profile) throw new Error(`Western Union: unsupported pair ${pair.from}-${pair.to}`);

    const data = await fetchCatalog(pair, sendAmount, profile);
    const groups = data.services_groups ?? [];
    if (groups.length === 0) {
      throw new Error('Western Union: no services_groups in response');
    }
    const best = pickBestPayGroup(groups);
    if (!best) {
      throw new Error('Western Union: no usable pay_group found');
    }

    return {
      providerId: 'westernUnion',
      dataSource: 'westernunion_api',
      pair,
      sendAmount: best.pay.send_amount ?? sendAmount,
      receiveAmount: best.pay.receive_amount,
      rate: best.pay.fx_rate,
      feeAmount: best.pay.gross_fee ?? 0,
      capturedAt: new Date(),
      raw: { service: best.service.service_name, fund_out: best.service.fund_out_mnem, response: data },
    };
  },
};
