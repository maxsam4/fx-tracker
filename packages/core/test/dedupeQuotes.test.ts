import { describe, it, expect } from 'vitest';
import { dedupeQuotes } from '../src/dedupe.js';
import type { Quote } from '../src/providers/types.js';
import type { ProvidersConfig } from '../src/config/loadProviders.js';

const baseConfig: ProvidersConfig = {
  pairs: {},
  midMarket: { sources: [], referenceOnly: [], outlierTolerancePct: 2 },
  preferredSource: { lulu: 'masarif' },
};

const pair = { from: 'AED', to: 'INR' };
const baseQuote: Omit<Quote, 'providerId' | 'dataSource'> = {
  pair,
  sendAmount: 1000,
  receiveAmount: 25000,
  rate: 25,
  feeAmount: 0,
  capturedAt: new Date('2026-04-30T12:00:00Z'),
};

describe('dedupeQuotes', () => {
  it('keeps a single quote per providerId', () => {
    const result = dedupeQuotes(
      [
        { ...baseQuote, providerId: 'wise', dataSource: 'wise_api' },
        { ...baseQuote, providerId: 'remitly', dataSource: 'wise_comparisons' },
      ],
      baseConfig,
    );
    expect(result).toHaveLength(2);
    expect(result.map((q) => q.providerId).sort()).toEqual(['remitly', 'wise']);
  });

  it('preferred source wins when configured', () => {
    const fromMasarif = {
      ...baseQuote,
      providerId: 'lulu',
      dataSource: 'masarif',
      rate: 25.5,
    };
    const fromDirect = {
      ...baseQuote,
      providerId: 'lulu',
      dataSource: 'lulu_direct',
      rate: 25.0,
    };
    // Order: direct first, then masarif. preferredSource[lulu]=masarif so masarif wins.
    const result = dedupeQuotes([fromDirect, fromMasarif], baseConfig);
    expect(result).toHaveLength(1);
    expect(result[0]!.dataSource).toBe('masarif');
    expect(result[0]!.rate).toBe(25.5);
  });

  it('first source wins when no preferredSource is configured', () => {
    const a = { ...baseQuote, providerId: 'mystery', dataSource: 'sourceA', rate: 24 };
    const b = { ...baseQuote, providerId: 'mystery', dataSource: 'sourceB', rate: 25 };
    const result = dedupeQuotes([a, b], baseConfig);
    expect(result).toHaveLength(1);
    expect(result[0]!.dataSource).toBe('sourceA');
  });

  it('matches preferredSource by prefix', () => {
    // dataSource 'masarif_v2' should still match preferred 'masarif'.
    const fromMasarifV2 = {
      ...baseQuote,
      providerId: 'lulu',
      dataSource: 'masarif_v2',
      rate: 26,
    };
    const fromDirect = {
      ...baseQuote,
      providerId: 'lulu',
      dataSource: 'lulu_direct',
      rate: 25,
    };
    const result = dedupeQuotes([fromDirect, fromMasarifV2], baseConfig);
    expect(result[0]!.dataSource).toBe('masarif_v2');
  });

  it('empty input returns empty', () => {
    expect(dedupeQuotes([], baseConfig)).toEqual([]);
  });
});
