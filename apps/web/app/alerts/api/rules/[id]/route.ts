import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { isAuthenticated } from '@/lib/auth';
import { parsePairKey } from '@fx/core';
import { ensurePairId, getDb, alertRules } from '@fx/core/db';

const PatchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  pair: z.string().min(3).optional(),
  ruleType: z.enum(['interval', 'threshold']).optional(),
  intervalSeconds: z.coerce.number().int().min(60).optional(),
  thresholdOp: z.enum(['gt', 'lt']).optional(),
  thresholdValue: z.coerce.number().optional(),
  thresholdTarget: z.enum(['mid_market', 'best_effective']).optional(),
  referenceAmount: z.coerce.number().optional(),
  telegramChatId: z.string().min(1).optional(),
  cooldownSeconds: z.coerce.number().int().min(60).optional(),
  enabled: z
    .preprocess(
      (v) => v === true || v === 'true' || v === 'on' || v === '1',
      z.boolean(),
    )
    .optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  if (!(await isAuthenticated())) {
    return new NextResponse('unauthorized', { status: 401 });
  }
  const id = parseInt(params.id, 10);
  if (Number.isNaN(id)) return new NextResponse('bad id', { status: 400 });

  const body = await req.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return new NextResponse(parsed.error.issues.map((i) => i.message).join('\n'), {
      status: 400,
    });
  }
  const v = parsed.data;

  const db = getDb();
  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (v.name !== undefined) update.name = v.name;
  if (v.pair !== undefined) update.pairId = await ensurePairId(parsePairKey(v.pair));
  if (v.ruleType !== undefined) update.ruleType = v.ruleType;
  if (v.intervalSeconds !== undefined) update.intervalSeconds = v.intervalSeconds;
  if (v.thresholdOp !== undefined) update.thresholdOp = v.thresholdOp;
  if (v.thresholdValue !== undefined) update.thresholdValue = v.thresholdValue.toString();
  if (v.thresholdTarget !== undefined) update.thresholdTarget = v.thresholdTarget;
  if (v.referenceAmount !== undefined)
    update.referenceAmount = v.referenceAmount.toString();
  if (v.telegramChatId !== undefined) update.telegramChatId = v.telegramChatId;
  if (v.cooldownSeconds !== undefined) update.cooldownSeconds = v.cooldownSeconds;
  if (v.enabled !== undefined) update.enabled = v.enabled;

  await db.update(alertRules).set(update).where(eq(alertRules.id, id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  if (!(await isAuthenticated())) {
    return new NextResponse('unauthorized', { status: 401 });
  }
  const id = parseInt(params.id, 10);
  if (Number.isNaN(id)) return new NextResponse('bad id', { status: 400 });
  const db = getDb();
  await db.delete(alertRules).where(eq(alertRules.id, id));
  return NextResponse.json({ ok: true });
}
