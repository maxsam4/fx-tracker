import { and, desc, eq, sql } from 'drizzle-orm';
import {
  getDb,
  midMarketRates,
  providerQuotes,
  referenceRates,
  currencyPairs,
} from '@fx/core/db';
import type { CurrencyPair } from '@fx/core';

export async function getPairId(pair: CurrencyPair): Promise<number | null> {
  const db = getDb();
  const [row] = await db
    .select({ id: currencyPairs.id })
    .from(currencyPairs)
    .where(and(eq(currencyPairs.fromCode, pair.from), eq(currencyPairs.toCode, pair.to)))
    .limit(1);
  return row?.id ?? null;
}

export async function getMidMarketSeries(pairId: number, sinceMs: number) {
  const db = getDb();
  const rows = await db
    .select({
      capturedAt: midMarketRates.capturedAt,
      rate: midMarketRates.midRate,
      sourcesUsed: midMarketRates.sourcesUsed,
    })
    .from(midMarketRates)
    .where(
      and(
        eq(midMarketRates.pairId, pairId),
        sql`${midMarketRates.capturedAt} >= now() - (${sinceMs} || ' milliseconds')::interval`,
      ),
    )
    .orderBy(midMarketRates.capturedAt);
  return rows.map((r) => ({
    t: r.capturedAt.toISOString(),
    rate: parseFloat(r.rate),
    sources: r.sourcesUsed as string[],
  }));
}

export async function getReferenceSeries(pairId: number, sinceMs: number) {
  const db = getDb();
  const rows = await db
    .select({
      capturedAt: referenceRates.capturedAt,
      rate: referenceRates.rate,
      sourceId: referenceRates.sourceId,
    })
    .from(referenceRates)
    .where(
      and(
        eq(referenceRates.pairId, pairId),
        sql`${referenceRates.capturedAt} >= now() - (${sinceMs} || ' milliseconds')::interval`,
      ),
    )
    .orderBy(referenceRates.capturedAt);
  return rows.map((r) => ({
    t: r.capturedAt.toISOString(),
    rate: parseFloat(r.rate),
    sourceId: r.sourceId,
  }));
}

export async function getProviderSeries(
  pairId: number,
  sendAmount: number,
  sinceMs: number,
) {
  const db = getDb();
  const rows = await db
    .select({
      capturedAt: providerQuotes.capturedAt,
      providerId: providerQuotes.providerId,
      effectiveRate: providerQuotes.effectiveRate,
      sendAmount: providerQuotes.sendAmount,
      receiveAmount: providerQuotes.receiveAmount,
      feeAmount: providerQuotes.feeAmount,
    })
    .from(providerQuotes)
    .where(
      and(
        eq(providerQuotes.pairId, pairId),
        eq(providerQuotes.sendAmount, sendAmount.toString()),
        sql`${providerQuotes.capturedAt} >= now() - (${sinceMs} || ' milliseconds')::interval`,
      ),
    )
    .orderBy(providerQuotes.capturedAt);
  return rows.map((r) => ({
    t: r.capturedAt.toISOString(),
    providerId: r.providerId,
    effectiveRate: r.effectiveRate ? parseFloat(r.effectiveRate) : null,
    sendAmount: parseFloat(r.sendAmount),
    receiveAmount: parseFloat(r.receiveAmount),
    feeAmount: parseFloat(r.feeAmount),
  }));
}

// Hide rows older than this from the comparison table. Polling is hourly,
// so 4h ≈ "we tried 4 cycles and never got a fresh quote" — at that point
// the provider is effectively dark and surfacing its stale rate alongside
// fresh ones is misleading. Historical chart queries (getProviderSeries)
// intentionally do NOT apply this filter — they need the full history.
const FRESH_WINDOW_MS = 4 * 60 * 60 * 1000;

export async function getLatestProviderTable(pairId: number, sendAmount: number) {
  const db = getDb();
  const rows = await db.execute<{
    provider_id: string;
    data_source: string;
    captured_at: string;
    send_amount: string;
    receive_amount: string;
    effective_rate: string;
    fee_amount: string;
    rate: string;
  }>(sql`
    SELECT DISTINCT ON (provider_id)
      provider_id, data_source, captured_at, send_amount, receive_amount,
      effective_rate, fee_amount, rate
    FROM provider_quotes
    WHERE pair_id = ${pairId} AND send_amount = ${sendAmount}
      AND captured_at >= now() - (${FRESH_WINDOW_MS} || ' milliseconds')::interval
    ORDER BY provider_id, captured_at DESC
  `);
  return rows.map((r) => ({
    providerId: r.provider_id,
    dataSource: r.data_source,
    capturedAt: r.captured_at,
    sendAmount: parseFloat(r.send_amount),
    receiveAmount: parseFloat(r.receive_amount),
    effectiveRate: parseFloat(r.effective_rate),
    feeAmount: parseFloat(r.fee_amount),
    rate: parseFloat(r.rate),
  }));
}

export async function getLatestReferenceRates(pairId: number) {
  const db = getDb();
  const rows = await db.execute<{
    source_id: string;
    captured_at: string;
    rate: string;
  }>(sql`
    SELECT DISTINCT ON (source_id)
      source_id, captured_at, rate
    FROM reference_rates
    WHERE pair_id = ${pairId}
      AND captured_at >= now() - (${FRESH_WINDOW_MS} || ' milliseconds')::interval
    ORDER BY source_id, captured_at DESC
  `);
  return rows.map((r) => ({
    sourceId: r.source_id,
    capturedAt: r.captured_at,
    rate: parseFloat(r.rate),
  }));
}

export async function getLatestProviderRunStatus(pairId: number) {
  const db = getDb();
  const rows = await db.execute<{
    provider_id: string;
    status: string;
    error_message: string | null;
    started_at: string;
  }>(sql`
    SELECT DISTINCT ON (provider_id)
      provider_id, status, error_message, started_at
    FROM provider_runs
    WHERE pair_id = ${pairId}
    ORDER BY provider_id, started_at DESC
  `);
  return rows.map((r) => ({
    providerId: r.provider_id,
    status: r.status,
    errorMessage: r.error_message,
    startedAt: r.started_at,
  }));
}

export async function getLatestMid(pairId: number) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(midMarketRates)
    .where(eq(midMarketRates.pairId, pairId))
    .orderBy(desc(midMarketRates.capturedAt))
    .limit(1);
  return row
    ? {
        capturedAt: row.capturedAt.toISOString(),
        rate: parseFloat(row.midRate),
        sources: row.sourcesUsed as string[],
      }
    : null;
}
