import crypto from "node:crypto";
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

export const subscriptions = pgTable('billing_subscription', {
  id: uuid('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  storeId: uuid('store_id')
    .references(() => stores.id, { onDelete: 'cascade' })
    .unique()
    .notNull(),
  planKey: varchar('plan_key', { length: 32 }).$defaultFn(() => 'trial').notNull(),
  status: varchar('status', { length: 32 }).$defaultFn(() => 'trialing').notNull(),
  polarCustomerId: varchar('polar_customer_id', { length: 64 }),
  polarSubscriptionId: varchar('polar_subscription_id', { length: 64 }),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').$defaultFn(() => false).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).$defaultFn(() => new Date()).notNull(),
});

export const polarWebhookEvents = pgTable('billing_polarwebhookevent', {
  id: uuid('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  eventId: varchar('event_id', { length: 128 }).unique().notNull(),
  eventType: varchar('event_type', { length: 64 }).notNull(),
  payload: jsonb('payload').notNull(),
  status: varchar('status', { length: 32 }).$defaultFn(() => 'received').notNull(),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).$defaultFn(() => new Date()).notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
});
