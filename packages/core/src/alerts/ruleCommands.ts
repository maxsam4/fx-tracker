import { desc, eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { alertRules, currencyPairs, type AlertRuleRow } from '../db/schema.js';
import { ensurePairId } from '../db/pairs.js';
import { parsePairKey } from '../types.js';
import { armRuleAtCurrentSide } from './evaluator.js';
import { RuleSchema, PatchSchema, type RuleInput, type RulePatch } from './ruleSchema.js';

export class RuleValidationError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(issues.join('\n'));
    this.name = 'RuleValidationError';
    this.issues = issues;
  }
}

export interface CreatedRule {
  id: number;
}

export async function createAlertRule(input: RuleInput): Promise<CreatedRule> {
  const parsed = RuleSchema.safeParse(input);
  if (!parsed.success) {
    throw new RuleValidationError(parsed.error.issues.map((i) => i.message));
  }
  const v = parsed.data;
  const pairId = await ensurePairId(parsePairKey(v.pair));

  const db = getDb();
  const [row] = await db
    .insert(alertRules)
    .values({
      name: v.name,
      pairId,
      enabled: v.enabled,
      ruleType: v.ruleType,
      intervalSeconds: v.intervalSeconds ?? null,
      thresholdOp: v.thresholdOp ?? null,
      thresholdValue: v.thresholdValue?.toString() ?? null,
      thresholdTarget: v.thresholdTarget ?? null,
      referenceAmount: v.referenceAmount?.toString() ?? null,
      telegramChatId: v.telegramChatId,
      cooldownSeconds: v.cooldownSeconds,
    })
    .returning({ id: alertRules.id });

  if (!row?.id) throw new Error('insert returned no id');

  if (v.ruleType === 'threshold') {
    try {
      await armRuleAtCurrentSide(row.id);
    } catch (err) {
      // Match prior behaviour: arming failure is logged but doesn't fail creation.
      console.error('failed to arm rule', row.id, err);
    }
  }

  return { id: row.id };
}

export async function patchAlertRule(id: number, patch: RulePatch): Promise<void> {
  const parsed = PatchSchema.safeParse(patch);
  if (!parsed.success) {
    throw new RuleValidationError(parsed.error.issues.map((i) => i.message));
  }
  const v = parsed.data;
  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (v.name !== undefined) update.name = v.name;
  if (v.pair !== undefined) update.pairId = await ensurePairId(parsePairKey(v.pair));
  if (v.ruleType !== undefined) update.ruleType = v.ruleType;
  if (v.intervalSeconds !== undefined) update.intervalSeconds = v.intervalSeconds;
  if (v.thresholdOp !== undefined) update.thresholdOp = v.thresholdOp;
  if (v.thresholdValue !== undefined) update.thresholdValue = v.thresholdValue.toString();
  if (v.thresholdTarget !== undefined) update.thresholdTarget = v.thresholdTarget;
  if (v.referenceAmount !== undefined) update.referenceAmount = v.referenceAmount.toString();
  if (v.telegramChatId !== undefined) update.telegramChatId = v.telegramChatId;
  if (v.cooldownSeconds !== undefined) update.cooldownSeconds = v.cooldownSeconds;
  if (v.enabled !== undefined) update.enabled = v.enabled;

  const db = getDb();
  await db.update(alertRules).set(update).where(eq(alertRules.id, id));
}

export async function setAlertEnabled(id: number, enabled: boolean): Promise<void> {
  const db = getDb();
  await db
    .update(alertRules)
    .set({ enabled, updatedAt: new Date() })
    .where(eq(alertRules.id, id));
}

export async function deleteAlertRule(id: number): Promise<void> {
  const db = getDb();
  await db.delete(alertRules).where(eq(alertRules.id, id));
}

export interface ListedAlertRule extends AlertRuleRow {
  fromCode: string;
  toCode: string;
}

export async function listAlertRules(opts: {
  page?: number;
  pageSize?: number;
} = {}): Promise<{ rows: ListedAlertRule[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(0, opts.page ?? 0);
  const pageSize = Math.max(1, Math.min(50, opts.pageSize ?? 5));
  const db = getDb();
  const rows = await db
    .select({
      rule: alertRules,
      fromCode: currencyPairs.fromCode,
      toCode: currencyPairs.toCode,
    })
    .from(alertRules)
    .leftJoin(currencyPairs, eq(alertRules.pairId, currencyPairs.id))
    .orderBy(desc(alertRules.createdAt))
    .limit(pageSize + 1)
    .offset(page * pageSize);

  const sliced = rows.slice(0, pageSize);
  const hasMore = rows.length > pageSize;

  const out: ListedAlertRule[] = sliced.map((r) => ({
    ...r.rule,
    fromCode: r.fromCode ?? '?',
    toCode: r.toCode ?? '?',
  }));
  return { rows: out, total: hasMore ? -1 : page * pageSize + out.length, page, pageSize };
}

export async function getAlertRuleById(id: number): Promise<ListedAlertRule | null> {
  const db = getDb();
  const [row] = await db
    .select({
      rule: alertRules,
      fromCode: currencyPairs.fromCode,
      toCode: currencyPairs.toCode,
    })
    .from(alertRules)
    .leftJoin(currencyPairs, eq(alertRules.pairId, currencyPairs.id))
    .where(eq(alertRules.id, id))
    .limit(1);
  if (!row) return null;
  return { ...row.rule, fromCode: row.fromCode ?? '?', toCode: row.toCode ?? '?' };
}
