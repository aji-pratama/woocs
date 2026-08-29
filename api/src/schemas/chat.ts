import { z } from 'zod';

export const CustomerInfoSchema = z.object({
  name: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
});

export const PageContextSchema = z.object({
  page_type: z.string().optional(),
  product_id: z.number().int().optional(),
  product_name: z.string().optional(),
});

export const ChatRequestInSchema = z.object({
  store_id: z.string().uuid(),
  session_id: z.string().uuid(),
  message: z.string().min(1),
  page_context: PageContextSchema.optional(),
  customer_info: CustomerInfoSchema.optional(),
});

export const ChatResponseOutSchema = z.object({
  message: z.string(),
  response_type: z.string().default('text'),
  confidence_score: z.number().nullable().optional(),
  escalated: z.boolean(),
  escalation_reason: z.string().nullable().optional(),
  product_data: z.record(z.string(), z.any()).nullable().optional(),
});

export const ChatHistoryResponseOutSchema = z.object({
  session_id: z.string().uuid(),
  messages: z.array(
    z.object({
      id: z.string().uuid(),
      role: z.enum(['user', 'assistant']),
      content: z.string(),
      response_type: z.string(),
      created_at: z.string(),
    })
  ),
});

export const OrderStatusRequestInSchema = z.object({
  store_id: z.string().uuid(),
  order_id: z.string(),
  billing_email: z.string().email(),
});
