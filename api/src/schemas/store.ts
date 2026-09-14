import { z } from 'zod';

export const KnowledgeUrlSchema = z.object({
  url: z.string().url(),
}).strict();

export type KnowledgeUrl = z.infer<typeof KnowledgeUrlSchema>;

export const StoreRegisterInSchema = z.object({
  wc_url: z.string().url(),
  api_key: z.string().min(1).optional(),
  merchant_email: z.string().email().optional(),
  wc_consumer_key: z.string().min(1).optional(),
  wc_consumer_secret: z.string().min(1).optional(),
}).strict();

export type StoreRegisterIn = z.infer<typeof StoreRegisterInSchema>;

export const StoreSettingsInSchema = z.object({
  powered_by_enabled: z.boolean(),
}).strict();

export type StoreSettingsIn = z.infer<typeof StoreSettingsInSchema>;

export const StoreRegisterOutSchema = z.object({
  store_id: z.string().uuid(),
  store_name: z.string(),
  valid: z.boolean(),
  api_key: z.string().nullable(),
});

export type StoreRegisterOut = z.infer<typeof StoreRegisterOutSchema>;

export const ProductVariationSyncSchema = z.object({
  wc_variation_id: z.number().int(),
  attributes: z.record(z.string(), z.string()).default({}),
  stock_quantity: z.number().int().nullable().optional(),
  price: z.number().nullable().optional(),
}).strict();

export type ProductVariationSync = z.infer<typeof ProductVariationSyncSchema>;

export const ProductSyncSchema = z.object({
  wc_id: z.number().int(),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  price: z.number().nullable().optional(),
  stock_status: z.string().default('instock'),
  stock_quantity: z.number().int().nullable().optional(),
  categories: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  variations: z.array(ProductVariationSyncSchema).default([]),
}).strict();

export type ProductSync = z.infer<typeof ProductSyncSchema>;

export const FAQSyncSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
}).strict();

export type FAQSync = z.infer<typeof FAQSyncSchema>;

export const SyncRequestInSchema = z.object({
  products: z.array(ProductSyncSchema).default([]),
  faqs: z.array(FAQSyncSchema).default([]),
}).strict();

export type SyncRequestIn = z.infer<typeof SyncRequestInSchema>;

export const SyncResponseOutSchema = z.object({
  task_id: z.string(),
  status: z.string(),
  products_received: z.number().int(),
  faqs_received: z.number().int(),
});

export type SyncResponseOut = z.infer<typeof SyncResponseOutSchema>;

export const SyncStatusOutSchema = z.object({
  task_id: z.string(),
  status: z.enum(['pending', 'running', 'completed', 'failed']),
  products_synced: z.number().int().optional(),
  faqs_synced: z.number().int().optional(),
  error: z.string().nullable().optional(),
});

export type SyncStatusOut = z.infer<typeof SyncStatusOutSchema>;

export const KnowledgeListOutSchema = z.object({
  documents: z.array(z.object({
    id: z.string().uuid(),
    sourceUrl: z.string().url(),
    createdAt: z.string(),
    status: z.enum(['pending', 'processing', 'completed', 'failed']),
  })),
});

export type KnowledgeListOut = z.infer<typeof KnowledgeListOutSchema>;

export const KnowledgeDocumentOutSchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  source: z.string(),
  status: z.string(),
  updated_at: z.string(),
});
