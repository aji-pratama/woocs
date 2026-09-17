CREATE INDEX IF NOT EXISTS "chat_message_session_created_idx" ON "chat_chatmessage" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_session_store_created_idx" ON "chat_chatsession" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "store_faq_store_idx" ON "store_faq" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "store_knowledgechunk_doc_idx" ON "store_knowledgechunk" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "store_knowledgedoc_store_idx" ON "store_knowledgedocument" USING btree ("store_id");