import { z } from 'zod';

export const StoreRegisterInSchema = z.object({
  wc_url: z.string().url(),
  api_key: z.string().optional(),
  merchant_email: z.string().email().optional(),
  wc_consumer_key: z.string().optional(),
  wc_consumer_secret: z.string().optional(),
});

export const StoreRegisterOutSchema = z.object({
  store_id: z.string().uuid(),
  store_name: z.string(),
  valid: z.boolean(),
  api_key: z.string().nullable(),
});

export const ProductVariationSyncSchema = z.object({
  wc_variation_id: z.number().int(),
  attributes: z.record(z.string(), z.string()).default({}),
  stock_quantity: z.number().int().nullable().optional(),
  price: z.number().nullable().optional(),
});

export const ProductSyncSchema = z.object({
  wc_id: z.number().int(),
  name: z.string(),
  description: z.string().nullable().optional(),
  price: z.number().nullable().optional(),
  stock_status: z.string().default('instock'),
  stock_quantity: z.number().int().nullable().optional(),
  categories: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  variations: z.array(ProductVariationSyncSchema).default([]),
});

export const FAQSyncSchema = z.object({
  question: z.string(),
  answer: z.string(),
});

export const SyncRequestInSchema = z.object({
  products: z.array(ProductSyncSchema).default([]),
  faqs: z.array(FAQSyncSchema).default([]),
});

export const SyncResponseOutSchema = z.object({
  task_id: z.string(),
  status: z.string(),
  products_received: z.number().int(),
  faqs_received: z.number().int(),
});

export const SyncStatusOutSchema = z.object({
  task_id: z.string(),
  status: z.enum(['pending', 'running', 'completed', 'failed']),
  products_synced: z.number().int().optional(),
  faqs_synced: z.number().int().optional(),
  error: z.string().nullable().optional(),
});
