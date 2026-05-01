import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the providers module BEFORE importing computeMidMarket
vi.mock('../src/providers/index.js', () => {
  const sources = new Map<string, { fetchRate: (i: any) => Promise<any> }>();
  return {
    getReferenceSource: (id: string) => {
      const s = sources.get(id);
      if (!s) throw new Error(`unknown source: ${id}`);
      return { id, displayName: id, ...s };
    },
    __setSources: (entries: Array<[string, number | Error]>) => {
      sources.clear();
      for (const [id, val] of entries) {
        sources.set(id, {
          fetchRate: async ({ pair }) => {
            if (val instanceof Error) throw val;
            return { sourceId: id, pair, rate: val, capturedAt: new Date() };
          },
        });
      }
    },
  };
});

import { computeMidMarket } from '../src/midMarket.js';
import * as providersModule from '../src/providers/index.js';

const setSources = (providersModule as unknown as {
  __setSources: (entries: Array<[string, number | Error]>) => void;
}).__setSources;

const pair = { from: 'USD', to: 'INR' };

describe('computeMidMarket', () => {
  beforeEach(() => setSources([]));

  it('takes median of three rates', async () => {
    setSources([
      ['a', 82.0],
      ['b', 83.0],
      ['c', 84.0],
    ]);
    const r = await computeMidMarket({
      pair,
      sourceIds: ['a', 'b', 'c'],
      outlierTolerancePct: 2.0,
    });
    expect(r.midRate).toBe(83.0);
    expect(r.sourcesUsed).toEqual(['a', 'b', 'c']);
  });

  it('drops outliers beyond tolerance', async () => {
    setSources([
      ['a', 82.0],
      ['b', 82.5],
      ['c', 90.0], // outlier
    ]);
    const r = await computeMidMarket({
      pair,
      sourceIds: ['a', 'b', 'c'],
      outlierTolerancePct: 2.0,
    });
    expect(r.sourcesUsed).toEqual(['a', 'b']);
    expect(r.midRate).toBeCloseTo(82.25, 4);
  });

  it('survives a failed source', async () => {
    setSources([
      ['a', 82.0],
      ['b', new Error('boom')],
      ['c', 83.0],
    ]);
    const r = await computeMidMarket({
      pair,
      sourceIds: ['a', 'b', 'c'],
      outlierTolerancePct: 2.0,
    });
    expect(r.sourcesUsed).toEqual(['a', 'c']);
    expect(r.midRate).toBeCloseTo(82.5);
  });

  it('throws when all sources fail', async () => {
    setSources([
      ['a', new Error('a')],
      ['b', new Error('b')],
    ]);
    await expect(
      computeMidMarket({ pair, sourceIds: ['a', 'b'], outlierTolerancePct: 2 }),
    ).rejects.toThrow();
  });
});
