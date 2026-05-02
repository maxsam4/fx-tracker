import { randomUUID } from 'node:crypto';
import { logger } from '@fx/core';
import {
  loadProvidersConfig,
  parsePairKey,
  type ProvidersConfig,
} from '@fx/core/config';
import { getDb } from '@fx/core/db';
import {
  midMarketRates,
  providerQuotes,
  providerRuns,
  referenceRates,
} from '@fx/core/db';
import { ensurePairId } from '@fx/core/db';
import {
  getProvider,
  getReferenceSource,
} from '@fx/core/providers';
import type { Quote } from '@fx/core/providers';
import { computeMidMarket, dedupeQuotes } from '@fx/core';
import { evaluateThresholdsForPair } from '@fx/core/alerts';
import { withTimeout } from '@fx/core';
import type { CurrencyPair } from '@fx/core';

// 45s accommodates Remitly's Playwright calculator-drive path (~6-15s on a
// memory-constrained VPS where Chromium hydration is slow). Drop back to 30s
// if you move to a beefier host.
const PROVIDER_TIMEOUT_MS = 45_000;
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';

export async function runPollCycle(): Promise<void> {
  const config = loadProvidersConfig();
  for (const [pairKey, pairCfg] of Object.entries(config.pairs)) {
    if (!pairCfg.enabled) continue;
    const pair = parsePairKey(pairKey);
    try {
      await runForPair(pair, pairCfg, config);
    } catch (err) {
      logger.error({ pair: pairKey, err: String(err) }, 'pair poll failed');
    }
  }
}

async function runForPair(
  pair: CurrencyPair,
  pairCfg: ProvidersConfig['pairs'][string],
  config: ProvidersConfig,
): Promise<void> {
  const pairId = await ensurePairId(pair);
  const runId = randomUUID();
  const db = getDb();

  // 1. mid-market
  const mid = await computeMidMarket({
    pair,
    sourceIds: config.midMarket.sources,
    outlierTolerancePct: config.midMarket.outlierTolerancePct,
  });
  await db.insert(midMarketRates).values({
    pairId,
    capturedAt: mid.capturedAt,
    midRate: mid.midRate.toString(),
    sourcesUsed: mid.sourcesUsed,
    raw: mid.perSource,
  });
  logger.info({ pair: `${pair.from}-${pair.to}`, mid: mid.midRate }, 'mid-market stored');

  // 1b. Persist each successful per-source mid-market rate as a reference row
  // so the dashboard can show wiseMidMarket / xe / exchangerateHost individually
  // alongside provider quotes. Reuses the rates already fetched for the median —
  // no extra HTTP calls.
  const midSourceRows = Object.entries(mid.perSource)
    .filter(([, v]) => typeof v.rate === 'number')
    .map(([sourceId, v]) => ({
      pairId,
      sourceId,
      capturedAt: mid.capturedAt,
      rate: (v.rate as number).toString(),
      raw: { fromMidMarket: true } as object,
    }));
  if (midSourceRows.length > 0) {
    await db.insert(referenceRates).values(midSourceRows);
  }

  // 2. reference rates (display-only — sources NOT used for the median)
  for (const refId of pairCfg.referenceSources) {
    try {
      const r = await getReferenceSource(refId).fetchRate({ pair });
      await db.insert(referenceRates).values({
        pairId,
        sourceId: refId,
        capturedAt: r.capturedAt,
        rate: r.rate.toString(),
        raw: r.raw as object | null,
      });
    } catch (err) {
      logger.warn({ refId, err: String(err) }, 'reference rate fetch failed');
    }
  }

  // 3. provider quotes — once per (provider, sendAmount). Aggregators emit many.
  // Strategy: collect quotes from all providers concurrently, dedup at the END
  // using preferredSource, THEN persist. This makes preferredSource actually
  // work across providers (e.g., masarif's 'lulu' vs the direct 'lulu' plugin).
  for (const sendAmount of pairCfg.referenceAmounts) {
    interface ProviderResult {
      providerId: string;
      status: 'ok' | 'error' | 'timeout';
      errorMessage: string | null;
      startedAt: Date;
      finishedAt: Date;
      quotes: Quote[];
    }

    const results: ProviderResult[] = await Promise.all(
      pairCfg.providers.map(async (providerId) => {
        const provider = safeGetProvider(providerId);
        const startedAt = new Date();
        if (!provider || !provider.supports(pair)) {
          return {
            providerId,
            status: 'error' as const,
            errorMessage: provider ? 'pair not supported' : 'unknown provider',
            startedAt,
            finishedAt: new Date(),
            quotes: [],
          };
        }
        try {
          const result = await withTimeout(
            provider.fetchQuote({ pair, sendAmount }),
            PROVIDER_TIMEOUT_MS,
            `provider[${providerId}]`,
          );
          const quotes = Array.isArray(result) ? result : [result];
          return {
            providerId,
            status: 'ok' as const,
            errorMessage: null,
            startedAt,
            finishedAt: new Date(),
            quotes,
          };
        } catch (err) {
          const errorMessage = String(err);
          logger.warn({ providerId, sendAmount, err: errorMessage }, 'provider fetch failed');
          return {
            providerId,
            status: errorMessage.includes('timed out')
              ? ('timeout' as const)
              : ('error' as const),
            errorMessage,
            startedAt,
            finishedAt: new Date(),
            quotes: [],
          };
        }
      }),
    );

    // Persist run health for every provider call regardless of outcome.
    if (results.length > 0) {
      await db.insert(providerRuns).values(
        results.map((r) => ({
          runId,
          providerId: r.providerId,
          pairId,
          startedAt: r.startedAt,
          finishedAt: r.finishedAt,
          status: r.status,
          errorMessage: r.errorMessage,
          quotesEmitted: r.quotes.length,
        })),
      );
    }

    // Cross-provider dedup: combine all quotes for this sendAmount, then
    // resolve duplicates by preferredSource.
    const allQuotes = results.flatMap((r) => r.quotes);
    await persistQuotes(pairId, allQuotes, config);
  }

  // 4. evaluate threshold alerts now that data is fresh
  try {
    const fired = await evaluateThresholdsForPair(pairId, { baseUrl: BASE_URL });
    if (fired > 0) logger.info({ pairId, fired }, 'threshold alerts fired');
  } catch (err) {
    logger.error({ err: String(err) }, 'threshold alert evaluation failed');
  }
}

function safeGetProvider(id: string) {
  try {
    return getProvider(id);
  } catch {
    return null;
  }
}

async function persistQuotes(
  pairId: number,
  quotes: Quote[],
  config: ProvidersConfig,
): Promise<void> {
  if (quotes.length === 0) return;
  const deduped = dedupeQuotes(quotes, config);
  const db = getDb();
  await db.insert(providerQuotes).values(
    deduped.map((q) => ({
      pairId,
      providerId: q.providerId,
      dataSource: q.dataSource,
      capturedAt: q.capturedAt,
      sendAmount: q.sendAmount.toString(),
      receiveAmount: q.receiveAmount.toString(),
      rate: q.rate.toString(),
      feeAmount: q.feeAmount.toString(),
      raw: (q.raw ?? null) as object | null,
    })),
  );
}
