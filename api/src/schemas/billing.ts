import { z } from 'zod';

export const SubscriptionOutSchema = z.object({
  plan_key: z.string(),
  status: z.string(),
  cancel_at_period_end: z.boolean(),
  current_period_end: z.string().nullable(),
  active: z.boolean(),
});

export const CheckoutInSchema = z.object({
  plan_key: z.enum(['pro']),
});

export const UrlOutSchema = z.object({
  url: z.string().url(),
});
