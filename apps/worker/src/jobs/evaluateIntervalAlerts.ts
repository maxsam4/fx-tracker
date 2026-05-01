import { logger } from '@fx/core';
import { evaluateIntervalRules } from '@fx/core/alerts';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';

export async function runIntervalAlerts(): Promise<void> {
  const fired = await evaluateIntervalRules({ baseUrl: BASE_URL });
  if (fired > 0) {
    logger.info({ fired }, 'interval alerts fired');
  }
}
