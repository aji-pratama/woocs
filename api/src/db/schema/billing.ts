import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  boolean,
  text,
  jsonb,
} from 'drizzle-orm/pg-core';
import { stores } from './stores';

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  storeId: uuid('store_id')
    .references(() => stores.id, { onDelete: 'cascade' })
    .unique()
    .notNull(),
  planKey: varchar('plan_key', { length: 32 }).default('trial').notNull(),
  status: varchar('status', { length: 32 }).default('trialing').notNull(),
  polarCustomerId: varchar('polar_customer_id', { length: 64 }),
  polarSubscriptionId: varchar('polar_subscription_id', { length: 64 }),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const polarWebhookEvents = pgTable('polar_webhook_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: varchar('event_id', { length: 128 }).unique().notNull(),
  eventType: varchar('event_type', { length: 64 }).notNull(),
  payload: jsonb('payload').notNull(),
  status: varchar('status', { length: 32 }).default('received').notNull(),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
});
