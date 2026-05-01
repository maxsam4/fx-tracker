import { describe, it, expect, afterEach } from 'vitest';
import { asporaProvider } from '../../src/providers/aspora.js';
import { installFetchMock, resetFetchMock } from '../helpers/mockFetch.js';
import { readFixtureJson } from '../helpers/fixtures.js';

const usdFixture = readFixtureJson('providers/aspora-USD-INR.json');
const aedFixture = readFixtureJson('providers/aspora-AED-INR.json');

describe('asporaProvider.fetchQuote', () => {
  afterEach(() => resetFetchMock());

  it('parses Aspora row from USD-INR response', async () => {
    installFetchMock({
      'https://api-z1.aspora.com/appserver/public-forex-provider/get-rates': { body: usdFixture },
    });
    const q = await asporaProvider.fetchQuote({
      pair: { from: 'USD', to: 'INR' },
      sendAmount: 1000,
    });
    const single = Array.isArray(q) ? q[0]! : q;
    expect(single.providerId).toBe('aspora');
    expect(single.dataSource).toBe('aspora_api');
    expect(single.rate).toBe(95.03);
    expect(single.feeAmount).toBe(2.99);
    expect(single.receiveAmount).toBe(94745.86);
  });

  it('parses Aspora row from AED-INR response', async () => {
    installFetchMock({
      'https://api-z1.aspora.com/appserver/public-forex-provider/get-rates': { body: aedFixture },
    });
    const q = await asporaProvider.fetchQuote({
      pair: { from: 'AED', to: 'INR' },
      sendAmount: 5000,
    });
    const single = Array.isArray(q) ? q[0]! : q;
    expect(single.rate).toBe(25.83);
    expect(single.feeAmount).toBe(0);
  });

  it('throws if Aspora row absent from response', async () => {
    installFetchMock({
      'https://api-z1.aspora.com/appserver/public-forex-provider/get-rates': {
        body: {
          base_currency: 'USD',
          quote_currency: 'INR',
          send_amount: 1000,
          providers: [{ name: 'OtherCo', quote: { rate: 90, fee: 0, received_amount: 90000 } }],
        },
      },
    });
    await expect(
      asporaProvider.fetchQuote({ pair: { from: 'USD', to: 'INR' }, sendAmount: 1000 }),
    ).rejects.toThrow(/Aspora row not found/);
  });

  it('propagates server errors', async () => {
    installFetchMock({
      'https://api-z1.aspora.com/appserver/public-forex-provider/get-rates': { status: 500, text: 'oops' },
    });
    await expect(
      asporaProvider.fetchQuote({ pair: { from: 'USD', to: 'INR' }, sendAmount: 1000 }),
    ).rejects.toThrow(/HTTP 500/);
  });

  it('declares supports correctly', () => {
    expect(asporaProvider.supports({ from: 'USD', to: 'INR' })).toBe(true);
    expect(asporaProvider.supports({ from: 'AED', to: 'INR' })).toBe(true);
    expect(asporaProvider.supports({ from: 'GBP', to: 'INR' })).toBe(false);
  });
});
