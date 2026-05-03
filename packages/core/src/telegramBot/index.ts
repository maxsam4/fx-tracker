import { logger } from '../logger.js';
import { startLongPoll } from './longPoll.js';
import { startWizardTtlSweeper } from './state.js';

export async function startTelegramBot(): Promise<void> {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    logger.warn('TELEGRAM_BOT_TOKEN unset — bot not started');
    return;
  }
  if (!process.env.TELEGRAM_BOT_PIN) {
    logger.warn('TELEGRAM_BOT_PIN unset — bot not started (inbound disabled)');
    return;
  }
  startWizardTtlSweeper();
  const handle = startLongPoll();
  logger.info('telegram bot long-poll loop started');
  // Block on the loop so the caller can `await` for shutdown semantics if it wants;
  // the worker entrypoint instead `void`s this and lets the cron host stay alive.
  await handle.done;
}

export { startLongPoll } from './longPoll.js';
