import { logger } from './logger.js';
import { median, pctDelta } from './utils/median.js';
import { withTimeout } from './utils/withTimeout.js';
import type { CurrencyPair } from './types.js';
import type { ReferenceRate } from './providers/types.js';
import { getReferenceSource } from './providers/index.js';

export interface MidMarketResult {
  pair: CurrencyPair;
  midRate: number;
  capturedAt: Date;
  sourcesUsed: string[];
  perSource: Record<string, { rate: number | null; error?: string }>;
}

interface ComputeInput {
  pair: CurrencyPair;
  sourceIds: string[];
  outlierTolerancePct: number;
}

export async function computeMidMarket(input: ComputeInput): Promise<MidMarketResult> {
  const { pair, sourceIds, outlierTolerancePct } = input;

  const settled = await Promise.allSettled(
    sourceIds.map((id) =>
      withTimeout(getReferenceSource(id).fetchRate({ pair }), 20_000, `mid-market[${id}]`),
    ),
  );

  const perSource: Record<string, { rate: number | null; error?: string }> = {};
  const valid: ReferenceRate[] = [];
  for (let i = 0; i < sourceIds.length; i++) {
    const id = sourceIds[i]!;
    const r = settled[i];
    if (r && r.status === 'fulfilled') {
      perSource[id] = { rate: r.value.rate };
      valid.push(r.value);
    } else {
      const err = r && r.status === 'rejected' ? String(r.reason) : 'unknown';
      perSource[id] = { rate: null, error: err };
      logger.warn({ sourceId: id, err }, 'mid-market source failed');
    }
  }

  if (valid.length === 0) {
    throw new Error(`All mid-market sources failed for ${pair.from}-${pair.to}`);
  }

  const initialMedian = median(valid.map((v) => v.rate));
  const survivors = valid.filter(
    (v) => Math.abs(pctDelta(v.rate, initialMedian)) <= outlierTolerancePct,
  );

  if (survivors.length === 0) {
    throw new Error('All mid-market sources marked as outliers — check outlierTolerancePct');
  }

  const finalMid = median(survivors.map((s) => s.rate));

  return {
    pair,
    midRate: finalMid,
    capturedAt: new Date(),
    sourcesUsed: survivors.map((s) => s.sourceId),
    perSource,
  };
}
