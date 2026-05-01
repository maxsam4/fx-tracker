import fs from 'node:fs';
import path from 'node:path';
import yaml from 'yaml';
import { z } from 'zod';
// Re-export parsePairKey here for convenience but the canonical home is types.ts.
export { parsePairKey } from '../types.js';

const PairConfigSchema = z.object({
  enabled: z.boolean().default(true),
  referenceAmounts: z.array(z.number().positive()).min(1),
  providers: z.array(z.string()).default([]),
  referenceSources: z.array(z.string()).default([]),
});

const ProvidersFileSchema = z.object({
  pairs: z.record(z.string(), PairConfigSchema),
  midMarket: z.object({
    sources: z.array(z.string()).min(1),
    referenceOnly: z.array(z.string()).default([]),
    outlierTolerancePct: z.number().positive().default(2.0),
  }),
  preferredSource: z.record(z.string(), z.string()).default({}),
});

export type ProvidersConfig = z.infer<typeof ProvidersFileSchema>;
export type PairConfig = z.infer<typeof PairConfigSchema>;

export function loadProvidersConfig(filePath?: string): ProvidersConfig {
  const resolved = filePath ?? defaultConfigPath();
  const raw = fs.readFileSync(resolved, 'utf8');
  const parsed = yaml.parse(raw);
  return ProvidersFileSchema.parse(parsed);
}

function defaultConfigPath(): string {
  // env override first
  const env = process.env.PROVIDERS_CONFIG_PATH;
  if (env) return env;
  // walk up to find config/providers.yml — works in dev and in compiled containers
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, 'config', 'providers.yml');
    if (fs.existsSync(candidate)) return candidate;
    const next = path.dirname(dir);
    if (next === dir) break;
    dir = next;
  }
  throw new Error('config/providers.yml not found; set PROVIDERS_CONFIG_PATH');
}
