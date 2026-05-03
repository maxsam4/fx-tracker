import {
  pgTable,
  serial,
  text,
  boolean,
  integer,
  numeric,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ----------------------------- currency pairs -----------------------------
export const currencyPairs = pgTable(
  'currency_pairs',
  {
    id: serial('id').primaryKey(),
    fromCode: text('from_code').notNull(),
    toCode: text('to_code').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqPair: uniqueIndex('currency_pairs_from_to_uniq').on(t.fromCode, t.toCode),
  }),
);

// ----------------------------- mid-market rates -----------------------------
export const midMarketRates = pgTable(
  'mid_market_rates',
  {
    id: serial('id').primaryKey(),
    pairId: integer('pair_id')
      .notNull()
      .references(() => currencyPairs.id, { onDelete: 'cascade' }),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
    midRate: numeric('mid_rate', { precision: 20, scale: 10 }).notNull(),
    sourcesUsed: jsonb('sources_used').notNull(),    // string[]
    raw: jsonb('raw'),                                // per-source rates
  },
  (t) => ({
    byPairTime: index('mid_market_pair_time_idx').on(t.pairId, t.capturedAt.desc()),
  }),
);

// ----------------------------- reference rates -----------------------------
export const referenceRates = pgTable(
  'reference_rates',
  {
    id: serial('id').primaryKey(),
    pairId: integer('pair_id')
      .notNull()
      .references(() => currencyPairs.id, { onDelete: 'cascade' }),
    sourceId: text('source_id').notNull(),           // e.g. 'googleFinance'
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
    rate: numeric('rate', { precision: 20, scale: 10 }).notNull(),
    raw: jsonb('raw'),
  },
  (t) => ({
    byPairSrcTime: index('reference_pair_src_time_idx').on(
      t.pairId,
      t.sourceId,
      t.capturedAt.desc(),
    ),
  }),
);

// ----------------------------- provider quotes -----------------------------
export const providerQuotes = pgTable(
  'provider_quotes',
  {
    id: serial('id').primaryKey(),
    pairId: integer('pair_id')
      .notNull()
      .references(() => currencyPairs.id, { onDelete: 'cascade' }),
    providerId: text('provider_id').notNull(),       // e.g. 'lulu'
    dataSource: text('data_source').notNull(),       // 'masarif' | 'lulu_direct' | 'wise_api'
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
    sendAmount: numeric('send_amount', { precision: 20, scale: 4 }).notNull(),
    receiveAmount: numeric('receive_amount', { precision: 20, scale: 4 }).notNull(),
    rate: numeric('rate', { precision: 20, scale: 10 }).notNull(),
    feeAmount: numeric('fee_amount', { precision: 20, scale: 4 }).notNull(),
    effectiveRate: numeric('effective_rate', { precision: 20, scale: 10 })
      .generatedAlwaysAs(sql`receive_amount / NULLIF(send_amount, 0)`),
    raw: jsonb('raw'),
  },
  (t) => ({
    byPairProviderTime: index('provider_quotes_pair_provider_time_idx').on(
      t.pairId,
      t.providerId,
      t.capturedAt.desc(),
    ),
    byPairTime: index('provider_quotes_pair_time_idx').on(t.pairId, t.capturedAt.desc()),
    byPairAmountTime: index('provider_quotes_pair_amount_time_idx').on(
      t.pairId,
      t.sendAmount,
      t.capturedAt.desc(),
    ),
  }),
);

// ----------------------------- provider runs (health) -----------------------------
export const providerRuns = pgTable('provider_runs', {
  id: serial('id').primaryKey(),
  runId: text('run_id').notNull(),
  providerId: text('provider_id').notNull(),
  pairId: integer('pair_id')
    .notNull()
    .references(() => currencyPairs.id, { onDelete: 'cascade' }),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  status: text('status').notNull(),                  // 'ok' | 'error' | 'timeout'
  errorMessage: text('error_message'),
  quotesEmitted: integer('quotes_emitted').notNull().default(0),
});

// ----------------------------- alert rules -----------------------------
export const alertRules = pgTable('alert_rules', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  pairId: integer('pair_id')
    .notNull()
    .references(() => currencyPairs.id, { onDelete: 'cascade' }),
  enabled: boolean('enabled').notNull().default(true),
  ruleType: text('rule_type').notNull(),             // 'interval' | 'threshold'
  // interval
  intervalSeconds: integer('interval_seconds'),
  // threshold
  thresholdOp: text('threshold_op'),                 // 'gt' | 'lt'
  thresholdValue: numeric('threshold_value', { precision: 20, scale: 10 }),
  thresholdTarget: text('threshold_target'),         // 'mid_market' | 'best_effective'
  referenceAmount: numeric('reference_amount', { precision: 20, scale: 4 }),
  // common
  telegramChatId: text('telegram_chat_id').notNull(),
  cooldownSeconds: integer('cooldown_seconds').notNull().default(3600),
  lastFiredAt: timestamp('last_fired_at', { withTimezone: true }),
  lastObservedSide: text('last_observed_side'),      // 'above' | 'below' (for threshold edge detection)
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ----------------------------- alert fires (audit) -----------------------------
export const alertFires = pgTable('alert_fires', {
  id: serial('id').primaryKey(),
  ruleId: integer('rule_id')
    .notNull()
    .references(() => alertRules.id, { onDelete: 'cascade' }),
  firedAt: timestamp('fired_at', { withTimezone: true }).notNull().defaultNow(),
  midRate: numeric('mid_rate', { precision: 20, scale: 10 }),
  bestProviderId: text('best_provider_id'),
  bestEffectiveRate: numeric('best_effective_rate', { precision: 20, scale: 10 }),
  payload: jsonb('payload').notNull(),
  telegramMessageId: text('telegram_message_id'),
  deliveryStatus: text('delivery_status').notNull().default('pending'),    // pending|sent|failed
  deliveryError: text('delivery_error'),
});

// ----------------------------- admin sessions -----------------------------
export const adminSessions = pgTable('admin_sessions', {
  id: serial('id').primaryKey(),
  tokenHash: text('token_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

// ----------------------------- bot authorized chats -----------------------------
// Telegram chat IDs allowed to drive the bot via /login. Persisted so a
// worker restart doesn't force re-PIN.
export const botAuthorizedChats = pgTable('bot_authorized_chats', {
  chatId: text('chat_id').primaryKey(),
  authorizedAt: timestamp('authorized_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  label: text('label'),
});

export type CurrencyPairRow = typeof currencyPairs.$inferSelect;
export type MidMarketRow = typeof midMarketRates.$inferSelect;
export type ReferenceRateRow = typeof referenceRates.$inferSelect;
export type ProviderQuoteRow = typeof providerQuotes.$inferSelect;
export type ProviderRunRow = typeof providerRuns.$inferSelect;
export type AlertRuleRow = typeof alertRules.$inferSelect;
export type AlertFireRow = typeof alertFires.$inferSelect;
export type BotAuthorizedChatRow = typeof botAuthorizedChats.$inferSelect;
