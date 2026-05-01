CREATE TABLE IF NOT EXISTS "admin_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "alert_fires" (
	"id" serial PRIMARY KEY NOT NULL,
	"rule_id" integer NOT NULL,
	"fired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"mid_rate" numeric(20, 10),
	"best_provider_id" text,
	"best_effective_rate" numeric(20, 10),
	"payload" jsonb NOT NULL,
	"telegram_message_id" text,
	"delivery_status" text DEFAULT 'pending' NOT NULL,
	"delivery_error" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "alert_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"pair_id" integer NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"rule_type" text NOT NULL,
	"interval_seconds" integer,
	"threshold_op" text,
	"threshold_value" numeric(20, 10),
	"threshold_target" text,
	"reference_amount" numeric(20, 4),
	"telegram_chat_id" text NOT NULL,
	"cooldown_seconds" integer DEFAULT 3600 NOT NULL,
	"last_fired_at" timestamp with time zone,
	"last_observed_side" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "currency_pairs" (
	"id" serial PRIMARY KEY NOT NULL,
	"from_code" text NOT NULL,
	"to_code" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mid_market_rates" (
	"id" serial PRIMARY KEY NOT NULL,
	"pair_id" integer NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"mid_rate" numeric(20, 10) NOT NULL,
	"sources_used" jsonb NOT NULL,
	"raw" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "provider_quotes" (
	"id" serial PRIMARY KEY NOT NULL,
	"pair_id" integer NOT NULL,
	"provider_id" text NOT NULL,
	"data_source" text NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"send_amount" numeric(20, 4) NOT NULL,
	"receive_amount" numeric(20, 4) NOT NULL,
	"rate" numeric(20, 10) NOT NULL,
	"fee_amount" numeric(20, 4) NOT NULL,
	"effective_rate" numeric(20, 10) GENERATED ALWAYS AS (receive_amount / NULLIF(send_amount, 0)) STORED,
	"raw" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "provider_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"pair_id" integer NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text NOT NULL,
	"error_message" text,
	"quotes_emitted" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reference_rates" (
	"id" serial PRIMARY KEY NOT NULL,
	"pair_id" integer NOT NULL,
	"source_id" text NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rate" numeric(20, 10) NOT NULL,
	"raw" jsonb
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "alert_fires" ADD CONSTRAINT "alert_fires_rule_id_alert_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."alert_rules"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_pair_id_currency_pairs_id_fk" FOREIGN KEY ("pair_id") REFERENCES "public"."currency_pairs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mid_market_rates" ADD CONSTRAINT "mid_market_rates_pair_id_currency_pairs_id_fk" FOREIGN KEY ("pair_id") REFERENCES "public"."currency_pairs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "provider_quotes" ADD CONSTRAINT "provider_quotes_pair_id_currency_pairs_id_fk" FOREIGN KEY ("pair_id") REFERENCES "public"."currency_pairs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "provider_runs" ADD CONSTRAINT "provider_runs_pair_id_currency_pairs_id_fk" FOREIGN KEY ("pair_id") REFERENCES "public"."currency_pairs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reference_rates" ADD CONSTRAINT "reference_rates_pair_id_currency_pairs_id_fk" FOREIGN KEY ("pair_id") REFERENCES "public"."currency_pairs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "currency_pairs_from_to_uniq" ON "currency_pairs" USING btree ("from_code","to_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mid_market_pair_time_idx" ON "mid_market_rates" USING btree ("pair_id","captured_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_quotes_pair_provider_time_idx" ON "provider_quotes" USING btree ("pair_id","provider_id","captured_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_quotes_pair_time_idx" ON "provider_quotes" USING btree ("pair_id","captured_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_quotes_pair_amount_time_idx" ON "provider_quotes" USING btree ("pair_id","send_amount","captured_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reference_pair_src_time_idx" ON "reference_rates" USING btree ("pair_id","source_id","captured_at" DESC NULLS LAST);