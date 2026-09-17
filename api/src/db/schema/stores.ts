import crypto from "node:crypto";
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
  boolean,
} from 'drizzle-orm/pg-core';

export const stores = pgTable('store_store', {
  id: uuid('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  apiKeyHash: varchar('api_key_hash', { length: 64 }).unique().notNull(),
  wcUrl: varchar('wc_url', { length: 255 }),
  wcConsumerKey: varchar('wc_consumer_key', { length: 255 }),
  wcConsumerSecret: varchar('wc_consumer_secret', { length: 255 }),
  merchantEmail: varchar('merchant_email', { length: 255 }),
  knowledgeSyncsThisMonth: integer('knowledge_syncs_this_month').default(0).notNull(),
  poweredByEnabled: boolean('powered_by_enabled').default(false).notNull(),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).$defaultFn(() => new Date()).notNull(),
});

export const products = pgTable(
  'store_product',
  {
    id: uuid('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: uuid('store_id')
      .references(() => stores.id, { onDelete: 'cascade' })
      .notNull(),
    wcId: integer('wc_id').notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    price: numeric('price', { precision: 10, scale: 2 }),
    stockStatus: varchar('stock_status', { length: 50 }).$defaultFn(() => 'instock').notNull(),
    stockQuantity: integer('stock_quantity'),
    categories: jsonb('categories').$defaultFn(() => []).notNull(),
    tags: jsonb('tags').$defaultFn(() => []).notNull(),
    embedding: vector('embedding', { dimensions: 1024 }),
    syncedAt: timestamp('synced_at', { withTimezone: true }).$defaultFn(() => new Date()).notNull(),
  },
  (table) => ({
    embeddingIndex: index('product_embedding_idx').using(
      'hnsw',
      table.embedding.op('vector_cosine_ops')
    ),
    unqStoreWcId: unique().on(table.storeId, table.wcId),
  })
);

export const productVariations = pgTable('store_productvariation', {
  id: uuid('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  productId: uuid('product_id')
    .references(() => products.id, { onDelete: 'cascade' })
    .notNull(),
  wcVariationId: integer('wc_variation_id').notNull(),
  attributes: jsonb('attributes').$defaultFn(() => ({})).notNull(),
  stockQuantity: integer('stock_quantity'),
  price: numeric('price', { precision: 10, scale: 2 }),
}, (table) => ({
  unqProductWcVariationId: unique().on(table.productId, table.wcVariationId),
}));

export const faqs = pgTable(
  'store_faq',
  {
    id: uuid('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: uuid('store_id')
      .references(() => stores.id, { onDelete: 'cascade' })
      .notNull(),
    question: text('question').notNull(),
    answer: text('answer').notNull(),
    embedding: vector('embedding', { dimensions: 1024 }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).$defaultFn(() => new Date()).notNull(),
  },
  (table) => ({
    embeddingIndex: index('faq_embedding_idx').using(
      'hnsw',
      table.embedding.op('vector_cosine_ops')
    ),
    storeIdx: index('store_faq_store_idx').on(table.storeId),
  })
);

export const knowledgeDocuments = pgTable(
  'store_knowledgedocument',
  {
    id: uuid('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: uuid('store_id')
      .references(() => stores.id, { onDelete: 'cascade' })
      .notNull(),
    type: varchar('type', { length: 20 }).notNull(), // 'url' or 'pdf'
    source: varchar('source', { length: 2048 }).notNull(),
    status: varchar('status', { length: 50 }).notNull(), // 'pending', 'processing', 'completed', 'error'
    updatedAt: timestamp('updated_at', { withTimezone: true }).$defaultFn(() => new Date()).notNull(),
  },
  (table) => ({
    storeIdx: index('store_knowledgedoc_store_idx').on(table.storeId),
  })
);

export const knowledgeChunks = pgTable('store_knowledgechunk', {
  id: uuid('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  documentId: uuid('document_id')
    .references(() => knowledgeDocuments.id, { onDelete: 'cascade' })
    .notNull(),
  content: text('content').notNull(),
  embedding: vector('embedding', { dimensions: 1024 }),
}, (table) => ({
  embeddingIndex: index('chunk_embedding_idx').using(
    'hnsw',
    table.embedding.op('vector_cosine_ops')
  ),
  docIdx: index('store_knowledgechunk_doc_idx').on(table.documentId),
}));
