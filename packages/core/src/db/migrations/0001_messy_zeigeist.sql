CREATE TABLE IF NOT EXISTS "bot_authorized_chats" (
	"chat_id" text PRIMARY KEY NOT NULL,
	"authorized_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"label" text
);
