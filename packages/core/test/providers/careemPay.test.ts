import { describe, it, expect, afterEach } from 'vitest';
import { careemPayProvider } from '../../src/providers/careemPay.js';
import { installFetchMock, resetFetchMock } from '../helpers/mockFetch.js';

const API = 'https://platform.careemapis.com/pubweb/api/remittance-widget-rates';

const FIXTURE = [
  {
    destinationCountry: 'IN',
    destinationCurrency: 'INR',
    estimatedTime: 'Money should arrive within 1 hour',
    fee: 5,
    feeThresholdAmount: 400,
    minAmount: 10,
    maxAmount: 150000,
    rate: 25.8,
  },
  {
    destinationCountry: 'GB',
    destinationCurrency: 'GBP',
    fee: 5,
    feeThresholdAmount: 400,
    minAmount: 10,
    maxAmount: 150000,
    rate: 0.1988,
  },
];

describe('careemPayProvider.fetchQuote', () => {
  afterEach(() => resetFetchMock());

  it('parses INR row and computes effective rate (fee waived above threshold)', async () => {
    installFetchMock({ [API]: { body: FIXTURE } });
    const q = await careemPayProvider.fetchQuote({
      pair: { from: 'AED', to: 'INR' },
      sendAmount: 5000,
    });
    const single = Array.isArray(q) ? q[0]! : q;
    expect(single.providerId).toBe('careemPay');
    expect(single.dataSource).toBe('careempay_api');
    expect(single.rate).toBe(25.8);
    // 5000 AED ≥ 400 threshold → fee waived
    expect(single.feeAmount).toBe(0);
    expect(single.receiveAmount).toBe(5000 * 25.8);
  });

  it('applies fixed fee when sendAmount is below threshold', async () => {
    installFetchMock({ [API]: { body: FIXTURE } });
    const q = await careemPayProvider.fetchQuote({
      pair: { from: 'AED', to: 'INR' },
      sendAmount: 100, // < 400 threshold
    });
    const single = Array.isArray(q) ? q[0]! : q;
    expect(single.feeAmount).toBe(5);
    expect(single.receiveAmount).toBe((100 - 5) * 25.8);
  });

  it('throws when API returns no INR row', async () => {
    installFetchMock({
      [API]: {
        body: [{ destinationCountry: 'GB', destinationCurrency: 'GBP', rate: 0.1988 }],
      },
    });
    await expect(
      careemPayProvider.fetchQuote({ pair: { from: 'AED', to: 'INR' }, sendAmount: 5000 }),
    ).rejects.toThrow(/no rate row/i);
  });

  it('throws when rate is out of plausible range (defensive)', async () => {
    installFetchMock({
      [API]: { body: [{ destinationCountry: 'IN', destinationCurrency: 'INR', rate: 99 }] },
    });
    await expect(
      careemPayProvider.fetchQuote({ pair: { from: 'AED', to: 'INR' }, sendAmount: 5000 }),
    ).rejects.toThrow(/out of range/i);
  });

  it('declares supports correctly (AED-INR only)', () => {
    expect(careemPayProvider.supports({ from: 'AED', to: 'INR' })).toBe(true);
    expect(careemPayProvider.supports({ from: 'USD', to: 'INR' })).toBe(false);
    expect(careemPayProvider.supports({ from: 'AED', to: 'GBP' })).toBe(false);
  });
});
