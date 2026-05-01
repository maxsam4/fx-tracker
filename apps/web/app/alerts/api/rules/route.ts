import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthenticated } from '@/lib/auth';
import { parsePairKey } from '@fx/core';
import { ensurePairId, getDb, alertRules } from '@fx/core/db';
import { armRuleAtCurrentSide } from '@fx/core/alerts';

const RuleSchema = z
  .object({
    name: z.string().min(1).max(120),
    pair: z.string().min(3),
    ruleType: z.enum(['interval', 'threshold']),
    intervalSeconds: z.coerce.number().int().min(60).optional(),
    thresholdOp: z.enum(['gt', 'lt']).optional(),
    thresholdValue: z.coerce.number().optional(),
    thresholdTarget: z.enum(['mid_market', 'best_effective']).optional(),
    referenceAmount: z.coerce.number().optional(),
    telegramChatId: z.string().min(1),
    cooldownSeconds: z.coerce.number().int().min(60).default(3600),
    enabled: z
      .preprocess(
        (v) => v === true || v === 'true' || v === 'on' || v === '1',
        z.boolean(),
      )
      .default(true),
  })
  .refine(
    (v) =>
      (v.ruleType === 'interval' && v.intervalSeconds != null) ||
      (v.ruleType === 'threshold' &&
        v.thresholdOp != null &&
        v.thresholdValue != null &&
        v.thresholdTarget != null),
    { message: 'missing fields for the chosen rule type' },
  );

export async function POST(req: Request) {
  if (!(await isAuthenticated())) {
    return new NextResponse('unauthorized', { status: 401 });
  }
  const body = await req.json();
  const parsed = RuleSchema.safeParse(body);
  if (!parsed.success) {
    return new NextResponse(parsed.error.issues.map((i) => i.message).join('\n'), {
      status: 400,
    });
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

  // Arm threshold rules at the current observed side so a new rule against an
  // already-past value doesn't fire retrospectively on the next poll.
  if (v.ruleType === 'threshold' && row?.id != null) {
    try {
      await armRuleAtCurrentSide(row.id);
    } catch (err) {
      console.error('failed to arm rule', row.id, err);
    }
  }

  return NextResponse.json({ id: row?.id });
}
