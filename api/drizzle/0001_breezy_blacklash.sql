CREATE TABLE IF NOT EXISTS "store_knowledgedocument" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"type" varchar(20) NOT NULL,
	"source" varchar(2048) NOT NULL,
	"status" varchar(50) NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "store_knowledgechunk" (
	"id" uuid PRIMARY KEY NOT NULL,
	"document_id" uuid NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1024)
);
--> statement-breakpoint
ALTER TABLE "store_store" ADD COLUMN IF NOT EXISTS "knowledge_syncs_this_month" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "store_knowledgedocument" ADD CONSTRAINT "store_knowledgedocument_store_id_store_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store_store"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "store_knowledgechunk" ADD CONSTRAINT "store_knowledgechunk_document_id_store_knowledgedocument_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."store_knowledgedocument"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chunk_embedding_idx" ON "store_knowledgechunk" USING hnsw ("embedding" vector_cosine_ops);
