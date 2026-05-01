import cron from 'node-cron';
import { logger } from '@fx/core';
import { runPollCycle } from './jobs/pollRates.js';
import { runIntervalAlerts } from './jobs/evaluateIntervalAlerts.js';
import { runHealthAlerts } from './jobs/healthAlerts.js';

const POLL_CRON = process.env.POLL_INTERVAL_CRON ?? '0 * * * *';
const ALERT_CRON = process.env.ALERT_TICK_CRON ?? '*/1 * * * *';

let pollInFlight = false;
let alertsInFlight = false;

async function safeRun(name: string, fn: () => Promise<void>, lockSetter: (b: boolean) => void) {
  try {
    lockSetter(true);
    logger.info({ job: name }, 'job started');
    await fn();
    logger.info({ job: name }, 'job finished');
  } catch (err) {
    logger.error({ job: name, err: String(err) }, 'job failed');
  } finally {
    lockSetter(false);
  }
}

logger.info({ POLL_CRON, ALERT_CRON }, 'worker starting');

cron.schedule(POLL_CRON, () => {
  if (pollInFlight) {
    logger.warn('previous poll still running; skipping');
    return;
  }
  void safeRun('pollRates', runPollCycle, (b) => (pollInFlight = b));
});

cron.schedule(ALERT_CRON, () => {
  if (alertsInFlight) return;
  void safeRun('intervalAlerts', runIntervalAlerts, (b) => (alertsInFlight = b));
});

// Self-health watcher: every 30 minutes scan provider_runs for streaks.
cron.schedule('*/30 * * * *', () => {
  void safeRun('healthAlerts', runHealthAlerts, () => {});
});

// Run a poll cycle on boot so we have data immediately.
void safeRun('pollRates(boot)', runPollCycle, (b) => (pollInFlight = b));

const shutdown = async (sig: string) => {
  logger.info({ sig }, 'worker shutting down');
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
