import { and, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import {
  alertFires,
  alertRules,
  midMarketRates,
  type AlertRuleRow,
} from '../db/schema.js';
import { logger } from '../logger.js';
import { sendTelegramMessage } from './telegram.js';
import { buildAlertMessage, type ProviderSnapshot } from './messageBuilder.js';
import { getProvider } from '../providers/index.js';
import type { CurrencyPair } from '../types.js';

export interface EvaluatorContext {
  baseUrl: string;
}

/**
 * Threshold rules are edge-triggered: fire only when the observed value
 * crosses the threshold relative to the previous observation. Cooldown
 * prevents flapping. Idempotent: an alert_fires row is written before the
 * Telegram send so a worker crash doesn't duplicate messages.
 */
export async function evaluateThresholdsForPair(
  pairId: number,
  ctx: EvaluatorContext,
): Promise<number> {
  const db = getDb();

  const rules = await db
    .select()
    .from(alertRules)
    .where(
      and(
        eq(alertRules.pairId, pairId),
        eq(alertRules.enabled, true),
        eq(alertRules.ruleType, 'threshold'),
      ),
    );
  if (rules.length === 0) return 0;

  const lastMid = await latestMid(pairId);
  if (!lastMid) return 0;

  const pair = await pairById(pairId);
  if (!pair) return 0;

  let firedCount = 0;
  for (const rule of rules) {
    if (
      rule.thresholdOp == null ||
      rule.thresholdValue == null ||
      rule.thresholdTarget == null
    ) {
      continue;
    }

    const target = await observedValue(rule, pairId);
    if (target == null) continue;

    const threshold = parseFloat(rule.thresholdValue);
    const op = rule.thresholdOp;
    const side = target > threshold ? 'above' : target < threshold ? 'below' : 'equal';

    // Edge-trigger: only fire when crossing relative to last *fired* observation.
    // We advance lastObservedSide only when we actually fire (or when cooldown
    // would have stopped us). This prevents flicker-during-cooldown from
    // missing the next legitimate cross.
    const triggered =
      (op === 'gt' && side === 'above' && rule.lastObservedSide !== 'above') ||
      (op === 'lt' && side === 'below' && rule.lastObservedSide !== 'below');

    if (!triggered) continue;
    if (inCooldown(rule)) {
      logger.info({ ruleId: rule.id }, 'threshold rule in cooldown, skipping');
      continue;
    }

    await fireRule(rule, pair, ctx, {
      triggerLabel: `${rule.thresholdTarget} ${op === 'gt' ? '>' : '<'} ${threshold}`,
      midRate: parseFloat(lastMid.midRate),
      midSourcesUsed: (lastMid.sourcesUsed as string[]) ?? [],
    });
    // Advance side ONLY on fire so flicker during cooldown doesn't lose the
    // next real cross.
    await db
      .update(alertRules)
      .set({ lastObservedSide: side, updatedAt: new Date() })
      .where(eq(alertRules.id, rule.id));
    firedCount++;
  }
  return firedCount;
}

export async function evaluateIntervalRules(ctx: EvaluatorContext): Promise<number> {
  const db = getDb();
  const due = await db
    .select()
    .from(alertRules)
    .where(
      and(
        eq(alertRules.ruleType, 'interval'),
        eq(alertRules.enabled, true),
        sql`(${alertRules.lastFiredAt} IS NULL OR ${alertRules.lastFiredAt} + (${alertRules.intervalSeconds} || ' seconds')::interval <= now())`,
      ),
    );
  if (due.length === 0) return 0;

  let fired = 0;
  for (const rule of due) {
    const lastMid = await latestMid(rule.pairId);
    if (!lastMid) continue;
    const pair = await pairById(rule.pairId);
    if (!pair) continue;
    await fireRule(rule, pair, ctx, {
      triggerLabel: `interval digest (every ${rule.intervalSeconds ?? 0}s)`,
      midRate: parseFloat(lastMid.midRate),
      midSourcesUsed: (lastMid.sourcesUsed as string[]) ?? [],
    });
    fired++;
  }
  return fired;
}

// Exported for tests so we can assert arming behavior on rule create.
export async function armRuleAtCurrentSide(ruleId: number): Promise<void> {
  const db = getDb();
  const [rule] = await db.select().from(alertRules).where(eq(alertRules.id, ruleId)).limit(1);
  if (!rule || rule.ruleType !== 'threshold') return;
  if (rule.thresholdValue == null || rule.thresholdOp == null) return;
  const observed = await observedValue(rule, rule.pairId);
  if (observed == null) return;
  const threshold = parseFloat(rule.thresholdValue);
  const side = observed > threshold ? 'above' : observed < threshold ? 'below' : 'equal';
  await db
    .update(alertRules)
    .set({ lastObservedSide: side, updatedAt: new Date() })
    .where(eq(alertRules.id, ruleId));
}

// ----------------------- helpers ------------------------

function inCooldown(rule: AlertRuleRow): boolean {
  if (!rule.lastFiredAt) return false;
  const cd = rule.cooldownSeconds * 1000;
  return Date.now() - rule.lastFiredAt.getTime() < cd;
}

async function latestMid(pairId: number) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(midMarketRates)
    .where(eq(midMarketRates.pairId, pairId))
    .orderBy(desc(midMarketRates.capturedAt))
    .limit(1);
  return row;
}

async function pairById(pairId: number): Promise<CurrencyPair | null> {
  const db = getDb();
  const [row] = await db.execute<{ from_code: string; to_code: string } & Record<string, unknown>>(
    sql`SELECT from_code, to_code FROM currency_pairs WHERE id = ${pairId}`,
  );
  return row ? { from: row.from_code, to: row.to_code } : null;
}

async function observedValue(rule: AlertRuleRow, pairId: number): Promise<number | null> {
  if (rule.thresholdTarget === 'mid_market') {
    const m = await latestMid(pairId);
    return m ? parseFloat(m.midRate) : null;
  }
  if (rule.thresholdTarget === 'best_effective') {
    const db = getDb();
    if (rule.referenceAmount == null) return null;
    const ref = parseFloat(rule.referenceAmount);
    // Best effective rate at this amount across the most recent quote per provider.
    const rows = await db.execute<{ effective_rate: string } & Record<string, unknown>>(sql`
      SELECT effective_rate
      FROM (
        SELECT DISTINCT ON (provider_id) provider_id, captured_at, effective_rate, send_amount
        FROM provider_quotes
        WHERE pair_id = ${pairId} AND send_amount = ${ref}
        ORDER BY provider_id, captured_at DESC
      ) latest
      ORDER BY effective_rate DESC
      LIMIT 1
    `);
    const first = rows[0];
    return first ? parseFloat(first.effective_rate) : null;
  }
  return null;
}

async function fireRule(
  rule: AlertRuleRow,
  pair: CurrencyPair,
  ctx: EvaluatorContext,
  details: { triggerLabel: string; midRate: number; midSourcesUsed: string[] },
): Promise<void> {
  const db = getDb();
  // For threshold rules with a referenceAmount, snapshot at that amount. For
  // mid_market thresholds and interval rules, default to the median amount of
  // available data (so the message doesn't compare apples-to-oranges).
  const snapshotAmount = await pickSnapshotAmount(rule, pair);
  const snapshots = await latestProviderSnapshots(rule.pairId, snapshotAmount);

  const text = buildAlertMessage({
    pair,
    midRate: details.midRate,
    midSourcesUsed: details.midSourcesUsed,
    triggerLabel: details.triggerLabel,
    providers: snapshots,
    baseUrl: ctx.baseUrl,
  });

  const [fire] = await db
    .insert(alertFires)
    .values({
      ruleId: rule.id,
      midRate: details.midRate.toString(),
      bestProviderId: snapshots[0]?.providerId ?? null,
      bestEffectiveRate: snapshots[0]?.effectiveRate.toString() ?? null,
      payload: { triggerLabel: details.triggerLabel, snapshots, snapshotAmount },
      deliveryStatus: 'pending',
    })
    .returning();

  const send = await sendTelegramMessage({
    chatId: rule.telegramChatId,
    text,
    parseMode: 'HTML',
  });

  await db
    .update(alertFires)
    .set({
      telegramMessageId: send.messageId ?? null,
      deliveryStatus: send.ok ? 'sent' : 'failed',
      deliveryError: send.ok ? null : send.error ?? 'unknown',
    })
    .where(eq(alertFires.id, fire!.id));

  await db
    .update(alertRules)
    .set({ lastFiredAt: new Date(), updatedAt: new Date() })
    .where(eq(alertRules.id, rule.id));
}

async function pickSnapshotAmount(
  rule: AlertRuleRow,
  pair: CurrencyPair,
): Promise<number | null> {
  if (rule.referenceAmount != null) return parseFloat(rule.referenceAmount);
  // Fallback: most-recent send_amount with the largest sample count. Avoids
  // mixing send-amounts in the alert table.
  const db = getDb();
  const rows = await db.execute<{ send_amount: string } & Record<string, unknown>>(sql`
    SELECT send_amount
    FROM provider_quotes
    WHERE pair_id = ${rule.pairId}
      AND captured_at > now() - interval '6 hours'
    GROUP BY send_amount
    ORDER BY count(*) DESC, send_amount DESC
    LIMIT 1
  `);
  const r = rows[0];
  return r ? parseFloat(r.send_amount) : null;
}

async function latestProviderSnapshots(
  pairId: number,
  sendAmount: number | null,
): Promise<ProviderSnapshot[]> {
  if (sendAmount == null) return [];
  const db = getDb();
  const rows = await db.execute<
    {
      provider_id: string;
      send_amount: string;
      receive_amount: string;
      effective_rate: string;
      fee_amount: string;
    } & Record<string, unknown>
  >(sql`
    SELECT DISTINCT ON (provider_id)
      provider_id, send_amount, receive_amount, effective_rate, fee_amount
    FROM provider_quotes
    WHERE pair_id = ${pairId} AND send_amount = ${sendAmount}
    ORDER BY provider_id, captured_at DESC
  `);

  return rows.map((r) => {
    let displayName: string | undefined;
    try {
      displayName = getProvider(r.provider_id).displayName;
    } catch {
      displayName = r.provider_id;
    }
    return {
      providerId: r.provider_id,
      displayName,
      effectiveRate: parseFloat(r.effective_rate),
      sendAmount: parseFloat(r.send_amount),
      receiveAmount: parseFloat(r.receive_amount),
      feeAmount: parseFloat(r.fee_amount),
    };
  });
}
