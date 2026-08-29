import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  numeric,
  integer,
  jsonb,
  vector,
  index,
  unique,
} from 'drizzle-orm/pg-core';

export const stores = pgTable('stores', {
  id: uuid('id').primaryKey().defaultRandom(),
  apiKeyHash: varchar('api_key_hash', { length: 64 }).unique().notNull(),
  wcUrl: varchar('wc_url', { length: 255 }),
  wcConsumerKey: varchar('wc_consumer_key', { length: 255 }),
  wcConsumerSecret: varchar('wc_consumer_secret', { length: 255 }),
  merchantEmail: varchar('merchant_email', { length: 255 }),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storeId: uuid('store_id')
      .references(() => stores.id, { onDelete: 'cascade' })
      .notNull(),
    wcId: integer('wc_id').notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    price: numeric('price', { precision: 10, scale: 2 }),
    stockStatus: varchar('stock_status', { length: 50 }).default('instock').notNull(),
    stockQuantity: integer('stock_quantity'),
    categories: jsonb('categories').default([]).notNull(),
    tags: jsonb('tags').default([]).notNull(),
    embedding: vector('embedding', { dimensions: 1024 }),
    syncedAt: timestamp('synced_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    embeddingIndex: index('product_embedding_idx').using(
      'hnsw',
      table.embedding.op('vector_cosine_ops')
    ),
    unqStoreWcId: unique().on(table.storeId, table.wcId),
  })
);

export const productVariations = pgTable('product_variations', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id')
    .references(() => products.id, { onDelete: 'cascade' })
    .notNull(),
  wcVariationId: integer('wc_variation_id').notNull(),
  attributes: jsonb('attributes').default({}).notNull(),
  stockQuantity: integer('stock_quantity'),
  price: numeric('price', { precision: 10, scale: 2 }),
}, (table) => ({
  unqProductWcVariationId: unique().on(table.productId, table.wcVariationId),
}));

export const faqs = pgTable(
  'faqs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storeId: uuid('store_id')
      .references(() => stores.id, { onDelete: 'cascade' })
      .notNull(),
    question: text('question').notNull(),
    answer: text('answer').notNull(),
    embedding: vector('embedding', { dimensions: 1024 }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    embeddingIndex: index('faq_embedding_idx').using(
      'hnsw',
      table.embedding.op('vector_cosine_ops')
    ),
  })
);
