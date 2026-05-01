import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: ['*.password', '*.token', '*.apiKey', 'TELEGRAM_BOT_TOKEN'],
    censor: '[REDACTED]',
  },
});
