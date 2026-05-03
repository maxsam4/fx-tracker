import { describe, it, expect, afterEach } from 'vitest';
import { westernUnionProvider } from '../../src/providers/westernUnion.js';
import { installFetchMock, resetFetchMock } from '../helpers/mockFetch.js';
import { readFixtureJson } from '../helpers/fixtures.js';

const ENDPOINT = 'https://www.westernunion.com/wuconnect/prices/catalog';
const usdFixture = readFixtureJson('providers/westernUnion-USD-INR.json');
const aedFixture = readFixtureJson('providers/westernUnion-AED-INR.json');

describe('westernUnionProvider.fetchQuote', () => {
  afterEach(() => resetFetchMock());

  it('parses USD-INR price catalog and picks Direct-to-Bank (best FX)', async () => {
    const { calls } = installFetchMock({ [ENDPOINT]: { body: usdFixture } });
    const q = await westernUnionProvider.fetchQuote({
      pair: { from: 'USD', to: 'INR' },
      sendAmount: 1000,
    });
    const single = Array.isArray(q) ? q[0]! : q;
    expect(single.providerId).toBe('westernUnion');
    expect(single.dataSource).toBe('westernunion_api');
    expect(single.rate).toBe(94.4329);
    expect(single.feeAmount).toBe(0);
    expect(single.receiveAmount).toBe(94433);

    const sent = JSON.parse(calls[0]!.init!.body as string);
    expect(sent.sender).toMatchObject({
      client: 'WUCOM',
      channel: 'WWEB',
      funds_in: 'AC',
      curr_iso3: 'USD',
      cty_iso2_ext: 'US',
      send_amount: '1000.00',
    });
  });

  it('parses AED-INR price catalog using UAE retail profile', async () => {
    const { calls } = installFetchMock({ [ENDPOINT]: { body: aedFixture } });
    const q = await westernUnionProvider.fetchQuote({
      pair: { from: 'AED', to: 'INR' },
      sendAmount: 5000,
    });
    const single = Array.isArray(q) ? q[0]! : q;
    expect(single.providerId).toBe('westernUnion');
    expect(single.rate).toBeGreaterThan(18);
    expect(single.rate).toBeLessThan(35);
    // Direct-to-Bank should win on this fixture (highest fx_rate, no fee).
    expect(single.feeAmount).toBe(0);

    const sent = JSON.parse(calls[0]!.init!.body as string);
    expect(sent.sender.channel).toBe('WRET');
    expect(sent.sender.curr_iso3).toBe('AED');
    expect(sent.sender.cty_iso2_ext).toBe('AE');
    expect(sent.sender.client).toMatch(/^AJ\d+$/);
  });

  it('falls back to a second AE client if the first errors', async () => {
    let call = 0;
    const { calls } = installFetchMock({
      [ENDPOINT]: () => {
        call += 1;
        if (call === 1) {
          return {
            body: {
              header_reply: { response_type: 'PRICECATALOG' },
              response_status: {
                status: -1,
                code: 'P1027',
                message: 'ERROR.MISSING PRICING SETUP FOR THIS CHANNEL AND CLIENT',
              },
            },
          };
        }
        return { body: aedFixture };
      },
    });
    const q = await westernUnionProvider.fetchQuote({
      pair: { from: 'AED', to: 'INR' },
      sendAmount: 5000,
    });
    expect((Array.isArray(q) ? q[0]! : q).rate).toBeGreaterThan(18);
    expect(calls.length).toBe(2);
    const first = JSON.parse(calls[0]!.init!.body as string);
    const second = JSON.parse(calls[1]!.init!.body as string);
    expect(first.sender.client).not.toBe(second.sender.client);
  });

  it('throws when API reports an error status on every client', async () => {
    installFetchMock({
      [ENDPOINT]: {
        body: {
          response_status: { status: -1, code: 'P1005', message: 'ERROR.MISSING CLIENT' },
        },
      },
    });
    await expect(
      westernUnionProvider.fetchQuote({ pair: { from: 'AED', to: 'INR' }, sendAmount: 5000 }),
    ).rejects.toThrow(/Western Union API error/);
  });

  it('throws when services_groups is empty', async () => {
    installFetchMock({
      [ENDPOINT]: {
        body: {
          response_status: { status: 0, code: 'P0000', message: 'OK' },
          services_groups: [],
        },
      },
    });
    await expect(
      westernUnionProvider.fetchQuote({ pair: { from: 'USD', to: 'INR' }, sendAmount: 1000 }),
    ).rejects.toThrow(/no services_groups/);
  });

  it('propagates HTTP failures', async () => {
    installFetchMock({ [ENDPOINT]: { status: 500, text: 'oops' } });
    await expect(
      westernUnionProvider.fetchQuote({ pair: { from: 'USD', to: 'INR' }, sendAmount: 1000 }),
    ).rejects.toThrow(/HTTP 500/);
  });
});
