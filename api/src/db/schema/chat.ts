import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  doublePrecision,
  jsonb,
  unique,
} from 'drizzle-orm/pg-core';
import { stores } from './stores';

export const chatSessions = pgTable(
  'chat_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storeId: uuid('store_id')
      .references(() => stores.id, { onDelete: 'cascade' })
      .notNull(),
    sessionId: uuid('session_id').notNull(),
    customerEmail: varchar('customer_email', { length: 255 }),
    customerName: varchar('customer_name', { length: 150 }),
    customerPhone: varchar('customer_phone', { length: 30 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    unqSession: unique().on(table.storeId, table.sessionId),
  })
);

export const chatMessages = pgTable('chat_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id')
    .references(() => chatSessions.id, { onDelete: 'cascade' })
    .notNull(),
  role: varchar('role', { length: 10 }).notNull(), // 'user' | 'assistant'
  content: text('content').notNull(),
  confidenceScore: doublePrecision('confidence_score'),
  escalated: boolean('escalated').default(false).notNull(),
  escalationReason: varchar('escalation_reason', { length: 30 }),
  responseType: varchar('response_type', { length: 20 }).default('text').notNull(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
