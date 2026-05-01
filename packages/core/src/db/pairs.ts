import { and, eq } from 'drizzle-orm';
import { getDb } from './client.js';
import { currencyPairs } from './schema.js';
import type { CurrencyPair } from '../types.js';

const cache = new Map<string, number>();

export async function ensurePairId(pair: CurrencyPair): Promise<number> {
  const key = `${pair.from}-${pair.to}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const db = getDb();
  const existing = await db
    .select({ id: currencyPairs.id })
    .from(currencyPairs)
    .where(and(eq(currencyPairs.fromCode, pair.from), eq(currencyPairs.toCode, pair.to)))
    .limit(1);

  if (existing[0]) {
    cache.set(key, existing[0].id);
    return existing[0].id;
  }

  const inserted = await db
    .insert(currencyPairs)
    .values({ fromCode: pair.from, toCode: pair.to, enabled: true })
    .returning({ id: currencyPairs.id });

  const id = inserted[0]?.id;
  if (!id) throw new Error(`Failed to insert pair ${key}`);
  cache.set(key, id);
  return id;
}

export async function getPairById(id: number): Promise<CurrencyPair | null> {
  const db = getDb();
  const row = await db
    .select()
    .from(currencyPairs)
    .where(eq(currencyPairs.id, id))
    .limit(1);
  if (!row[0]) return null;
  return { from: row[0].fromCode, to: row[0].toCode };
}
