CREATE TABLE IF NOT EXISTS "billing_polarwebhookevent" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" varchar(128) NOT NULL,
	"event_type" varchar(64) NOT NULL,
	"payload" jsonb NOT NULL,
	"status" varchar(32) NOT NULL,
	"error" text,
	"created_at" timestamp with time zone NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "billing_polarwebhookevent_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "billing_subscription" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"plan_key" varchar(32) NOT NULL,
	"status" varchar(32) NOT NULL,
	"polar_customer_id" varchar(64),
	"polar_subscription_id" varchar(64),
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "billing_subscription_store_id_unique" UNIQUE("store_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_chatmessage" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"role" varchar(10) NOT NULL,
	"content" text NOT NULL,
	"confidence_score" double precision,
	"escalated" boolean NOT NULL,
	"escalation_reason" varchar(30),
	"response_type" varchar(20) NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_chatsession" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"customer_email" varchar(255),
	"customer_name" varchar(150),
	"customer_phone" varchar(30),
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "chat_chatsession_store_id_session_id_unique" UNIQUE("store_id","session_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "store_faq" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"embedding" vector(1024),
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "store_productvariation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"wc_variation_id" integer NOT NULL,
	"attributes" jsonb NOT NULL,
	"stock_quantity" integer,
	"price" numeric(10, 2),
	CONSTRAINT "store_productvariation_product_id_wc_variation_id_unique" UNIQUE("product_id","wc_variation_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "store_product" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"wc_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"price" numeric(10, 2),
	"stock_status" varchar(50) NOT NULL,
	"stock_quantity" integer,
	"categories" jsonb NOT NULL,
	"tags" jsonb NOT NULL,
	"embedding" vector(1024),
	"synced_at" timestamp with time zone NOT NULL,
	CONSTRAINT "store_product_store_id_wc_id_unique" UNIQUE("store_id","wc_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "store_store" (
	"id" uuid PRIMARY KEY NOT NULL,
	"api_key_hash" varchar(64) NOT NULL,
	"wc_url" varchar(255),
	"wc_consumer_key" varchar(255),
	"wc_consumer_secret" varchar(255),
	"merchant_email" varchar(255),
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "store_store_api_key_hash_unique" UNIQUE("api_key_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"task_name" varchar(255) NOT NULL,
	"args" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"kwargs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"enqueued_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"result" jsonb,
	"traceback" text
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "billing_subscription" ADD CONSTRAINT "billing_subscription_store_id_store_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store_store"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chat_chatmessage" ADD CONSTRAINT "chat_chatmessage_session_id_chat_chatsession_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_chatsession"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chat_chatsession" ADD CONSTRAINT "chat_chatsession_store_id_store_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store_store"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "store_faq" ADD CONSTRAINT "store_faq_store_id_store_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store_store"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "store_productvariation" ADD CONSTRAINT "store_productvariation_product_id_store_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."store_product"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "store_product" ADD CONSTRAINT "store_product_store_id_store_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store_store"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "faq_embedding_idx" ON "store_faq" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_embedding_idx" ON "store_product" USING hnsw ("embedding" vector_cosine_ops);