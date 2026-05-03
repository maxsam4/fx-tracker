import { logger } from '../logger.js';
import { getUpdates } from './api.js';
import { handleUpdate } from './router.js';

const POLL_TIMEOUT_S = 30;
const BACKOFF_LADDER_MS = [1_000, 2_000, 5_000, 10_000];

interface LongPollControls {
  stop: () => void;
  done: Promise<void>;
}

export function startLongPoll(): LongPollControls {
  const controller = new AbortController();
  let stopped = false;

  const done = (async () => {
    let offset: number | undefined;
    let backoffIdx = 0;

    while (!stopped) {
      try {
        const updates = await getUpdates({
          offset,
          timeoutSeconds: POLL_TIMEOUT_S,
          signal: controller.signal,
        });
        backoffIdx = 0;
        for (const u of updates) {
          offset = u.update_id + 1;
          try {
            await handleUpdate(u);
          } catch (err) {
            logger.error({ err: String(err), updateId: u.update_id }, 'handleUpdate failed');
          }
        }
      } catch (err) {
        if (controller.signal.aborted) break;
        const wait = BACKOFF_LADDER_MS[Math.min(backoffIdx, BACKOFF_LADDER_MS.length - 1)]!;
        logger.warn(
          { err: String(err), wait },
          'telegram long-poll error; backing off',
        );
        backoffIdx++;
        await sleep(wait, controller.signal);
      }
    }
  })();

  return {
    stop: () => {
      stopped = true;
      controller.abort();
    },
    done,
  };
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const t = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(t);
      resolve();
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
