import { z } from 'zod';

export const RuleSchema = z
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

export type RuleInput = z.input<typeof RuleSchema>;
export type RuleParsed = z.output<typeof RuleSchema>;

export const PatchSchema = z.object({
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

export type RulePatch = z.infer<typeof PatchSchema>;
