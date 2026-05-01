import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { getDb } from '@fx/core/db';

export const dynamic = 'force-dynamic';

interface RowMid extends Record<string, unknown> {
  pair_key: string;
  last_seen: string;
}
interface RowProvider extends Record<string, unknown> {
  provider_id: string;
  pair_key: string;
  status: string;
  finished_at: string | null;
}

export async function GET() {
  const db = getDb();
  let mid: RowMid[] = [];
  let providers: RowProvider[] = [];
  try {
    mid = await db.execute<RowMid>(sql`
      SELECT cp.from_code || '-' || cp.to_code AS pair_key,
             max(m.captured_at) AS last_seen
      FROM mid_market_rates m
      JOIN currency_pairs cp ON cp.id = m.pair_id
      GROUP BY cp.from_code, cp.to_code
    `);
    providers = await db.execute<RowProvider>(sql`
      SELECT DISTINCT ON (pr.provider_id, pr.pair_id)
        pr.provider_id,
        cp.from_code || '-' || cp.to_code AS pair_key,
        pr.status,
        pr.finished_at::text
      FROM provider_runs pr
      JOIN currency_pairs cp ON cp.id = pr.pair_id
      ORDER BY pr.provider_id, pr.pair_id, pr.finished_at DESC NULLS LAST
    `);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: 'db unavailable', detail: String(err) },
      { status: 503 },
    );
  }
  return NextResponse.json({
    ok: true,
    midMarket: mid,
    providers,
    serverTime: new Date().toISOString(),
  });
}
