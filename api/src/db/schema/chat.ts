import crypto from "node:crypto";
import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  doublePrecision,
  jsonb,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { stores } from './stores';

export const chatSessions = pgTable(
  'chat_chatsession',
  {
    id: uuid('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: uuid('store_id')
      .references(() => stores.id, { onDelete: 'cascade' })
      .notNull(),
    sessionId: uuid('session_id').notNull(),
    customerEmail: varchar('customer_email', { length: 255 }),
    customerName: varchar('customer_name', { length: 150 }),
    customerPhone: varchar('customer_phone', { length: 30 }),
    leadLabel: varchar('lead_label', { length: 50 }).$defaultFn(() => 'lead'),
    createdAt: timestamp('created_at', { withTimezone: true }).$defaultFn(() => new Date()).notNull(),
  },
  (table) => ({
    unqSession: unique().on(table.storeId, table.sessionId),
    storeCreatedIdx: index('chat_session_store_created_idx').on(table.storeId, table.createdAt),
  })
);

export const chatMessages = pgTable(
  'chat_chatmessage',
  {
    id: uuid('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    sessionId: uuid('session_id')
      .references(() => chatSessions.id, { onDelete: 'cascade' })
      .notNull(),
    role: varchar('role', { length: 10 }).notNull(), // 'user' | 'assistant'
    content: text('content').notNull(),
    confidenceScore: doublePrecision('confidence_score'),
    escalated: boolean('escalated').$defaultFn(() => false).notNull(),
    escalationReason: varchar('escalation_reason', { length: 30 }),
    responseType: varchar('response_type', { length: 20 }).$defaultFn(() => 'text').notNull(),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).$defaultFn(() => new Date()).notNull(),
  },
  (table) => ({
    sessionCreatedIdx: index('chat_message_session_created_idx').on(table.sessionId, table.createdAt),
  })
);
