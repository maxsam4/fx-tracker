import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parsePairKey, loadProvidersConfig } from '@fx/core/config';
import {
  getPairId,
  getMidMarketSeries,
  getReferenceSeries,
  getLatestMid,
  getLatestProviderTable,
} from '@/lib/queries';

export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  amount: z.coerce.number().positive().optional(),
  window: z.coerce.number().positive().optional(),
});

export async function GET(
  req: Request,
  { params }: { params: { pair: string } },
) {
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    amount: url.searchParams.get('amount') ?? undefined,
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

  const sendAmount =
    parsed.data.amount && pairCfg.referenceAmounts.includes(parsed.data.amount)
      ? parsed.data.amount
      : pairCfg.referenceAmounts[Math.floor(pairCfg.referenceAmounts.length / 2)] ??
        pairCfg.referenceAmounts[0]!;
  const windowMs = parsed.data.window ?? 7 * 24 * 60 * 60 * 1000;

  const pairId = await getPairId(pair);
  if (!pairId) {
    return NextResponse.json({ mid: null, midSeries: [], refSeries: [], table: [] });
  }

  const [mid, midSeries, refSeries, table] = await Promise.all([
    getLatestMid(pairId),
    getMidMarketSeries(pairId, windowMs),
    getReferenceSeries(pairId, windowMs),
    getLatestProviderTable(pairId, sendAmount),
  ]);

  return NextResponse.json(
    { mid, midSeries, refSeries, table, pair: pairKey, sendAmount, windowMs },
    { headers: { 'Cache-Control': 'public, max-age=30' } },
  );
}
