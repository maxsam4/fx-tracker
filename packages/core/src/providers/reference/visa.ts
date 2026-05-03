import { withPage } from '../../scrape/browserPool.js';
import type { ReferenceRate, ReferenceSource } from '../types.js';

// Visa publishes their daily wholesale FX rate via a JSON endpoint that
// powers the consumer "exchange rate calculator" page:
//
//   GET https://usa.visa.com/cmsapi/fx/rates
//       ?amount=1&fee=0
//       &utcConvertedDate=MM/DD/YYYY
//       &exchangedate=MM/DD/YYYY
//       &fromCurr=USD&toCurr=INR
//
// The response body is JSON — `originalValues.fxRateVisa` is the rate. We
// drive the call through Playwright (not plain fetch) because the host
// sits behind Cloudflare turnstile, which verifies TLS fingerprints and
// runs a JS challenge. A real browser context passes; node's fetch (any
// UA) gets the "Just a moment…" interstitial. The data we end up reading
// is still the JSON API response — this is API consumption, not DOM
// scraping.

const ENDPOINT = 'https://usa.visa.com/cmsapi/fx/rates';

interface VisaResponse {
  originalValues?: {
    fxRateVisa?: string;
    lastUpdatedVisaRate?: number;
  };
}

function fmtDate(d: Date): string {
  // Visa's API expects MM/DD/YYYY (UTC). The slashes are URL-encoded by
  // URLSearchParams when we build the request.
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${mm}/${dd}/${d.getUTCFullYear()}`;
}

export const visaSource: ReferenceSource = {
  id: 'visa',
  displayName: 'Visa (settlement rate)',

  async fetchRate({ pair }): Promise<ReferenceRate> {
    const date = fmtDate(new Date());
    const url = new URL(ENDPOINT);
    url.searchParams.set('amount', '1');
    url.searchParams.set('fee', '0');
    url.searchParams.set('utcConvertedDate', date);
    url.searchParams.set('exchangedate', date);
    // Visa's query params are CARDHOLDER-CENTRIC, not FX-direction-centric:
    //   fromCurr = the currency the cardholder is billed in
    //   toCurr   = the currency the merchant transacts in
    // To get the rate "1 USD = X INR" (our pair USD→INR), we ask Visa "I'm
    // an INR cardholder paying a USD merchant" — i.e. fromCurr=INR, toCurr=USD.
    // Sending it the intuitive way (fromCurr=USD&toCurr=INR) returns the
    // INVERSE rate (~0.0105 USD per INR), which would silently look wrong
    // in the median.
    url.searchParams.set('fromCurr', pair.to);
    url.searchParams.set('toCurr', pair.from);

    const data = await withPage(async (page) => {
      await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 25_000 });
      // Cloudflare turnstile may take a beat to clear. The endpoint returns
      // raw JSON in the response body; once cleared, document.body.innerText
      // contains the JSON string.
      const text = await page.evaluate(() => document.body.innerText);
      try {
        return JSON.parse(text) as VisaResponse;
      } catch {
        // Unparseable text usually means the Cloudflare interstitial is
        // still rendered; treat as a transient failure.
        throw new Error('Visa response not JSON (likely Cloudflare challenge)');
      }
    });

    const rateStr = data.originalValues?.fxRateVisa;
    if (!rateStr) throw new Error('Visa response missing originalValues.fxRateVisa');
    const rate = parseFloat(rateStr);
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error(`Visa fxRateVisa invalid: ${rateStr}`);
    }
    return {
      sourceId: 'visa',
      pair,
      rate,
      capturedAt: new Date(),
      raw: data,
    };
  },
};
