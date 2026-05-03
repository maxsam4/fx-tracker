import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parsePairKey, loadProvidersConfig } from '@fx/core/config';
import {
  getPairId,
  getMidMarketSeries,
  getReferenceSeries,
  getLatestMid,
  getLatestProviderTable,
  getLatestReferenceRates,
  getLatestProviderRunStatus,
} from '@/lib/queries';

export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  window: z.coerce.number().positive().optional(),
});

export async function GET(
  req: Request,
  { params }: { params: { pair: string } },
) {
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    window: url.searchParams.get('window') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid query' }, { status: 400 });
  }

  const pairKey = decodeURIComponent(params.pair).toUpperCase();
  let pair;
  try {
    pair = parsePairKey(pairKey);
  } catch {
    return NextResponse.json({ error: 'invalid pair' }, { status: 400 });
  }

  const config = loadProvidersConfig();
  const pairCfg = config.pairs[pairKey];
  if (!pairCfg) return NextResponse.json({ error: 'unknown pair' }, { status: 404 });

  const sendAmount = pairCfg.referenceAmounts[0]!;
  const windowMs = parsed.data.window ?? 7 * 24 * 60 * 60 * 1000;

  const pairId = await getPairId(pair);
  if (!pairId) {
    return NextResponse.json({
      mid: null,
      midSeries: [],
      refSeries: [],
      table: [],
      refLatest: [],
      runStatus: [],
    });
  }

  const [mid, midSeries, refSeries, table, refLatest, runStatus] = await Promise.all([
    getLatestMid(pairId),
    getMidMarketSeries(pairId, windowMs),
    getReferenceSeries(pairId, windowMs),
    getLatestProviderTable(pairId, sendAmount),
    getLatestReferenceRates(pairId),
    getLatestProviderRunStatus(pairId),
  ]);

  return NextResponse.json(
    {
      mid,
      midSeries,
      refSeries,
      table,
      refLatest,
      runStatus,
      pair: pairKey,
      sendAmount,
      windowMs,
    },
    { headers: { 'Cache-Control': 'public, max-age=30' } },
  );
}
