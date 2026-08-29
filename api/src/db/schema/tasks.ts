import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  text,
  jsonb,
} from 'drizzle-orm/pg-core';

export const taskRecords = pgTable('task_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskName: varchar('task_name', { length: 255 }).notNull(),
  args: jsonb('args').default([]).notNull(),
  kwargs: jsonb('kwargs').default({}).notNull(),
  status: varchar('status', { length: 50 }).default('pending').notNull(), // 'pending', 'running', 'completed', 'failed'
  enqueuedAt: timestamp('enqueued_at', { withTimezone: true }).defaultNow().notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  result: jsonb('result'),
  traceback: text('traceback'),
});
