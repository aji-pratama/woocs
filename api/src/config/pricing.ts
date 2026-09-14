import { ENV } from '../config/env';

export type PlanTier = 'free' | 'pro' | 'custom';

export interface PlanFeatures {
  /** Can sync WooCommerce products to the knowledge base */
  syncCatalog: boolean;
  /** Maximum number of products allowed to be synced */
  maxProducts: number;
  /** Maximum number of custom FAQs allowed */
  maxFaqs: number;
  /** Maximum number of AI conversations allowed per month */
  monthlyConversationsLimit: number;
  /** Can the widget look up WooCommerce order statuses? */
  orderStatusLookup: boolean;
  /** Flag to indicate if this is a custom enterprise plan requiring contact */
  isCustom?: boolean;
}

export interface PlanConfig {
  id: PlanTier;
  name: string;
  /** Polar Product ID for this plan. Null for free/custom tiers. */
  polarProductId: string | null;
  /** Display price in USD. Null for custom. */
  priceUsd: number | null;
  features: PlanFeatures;
}

export const PRICING_PLANS: Record<PlanTier, PlanConfig> = {
  free: {
    id: 'free',
    name: 'Basic (Free)',
    polarProductId: null,
    priceUsd: 0,
    features: {
      syncCatalog: false, // Free tier can only use FAQs
      maxProducts: 0,
      maxFaqs: 10,
      monthlyConversationsLimit: 50,
      orderStatusLookup: false,
    },
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    // TODO: Replace with actual Polar product ID from Polar sandbox/dashboard
    polarProductId: ENV.POLAR_PRO_PRODUCT_ID,
    priceUsd: 29,
    features: {
      syncCatalog: true,
      maxProducts: 30, // Initially limited to 30 products for MVP scale
      maxFaqs: 200,
      monthlyConversationsLimit: 1000,
      orderStatusLookup: true,
    },
  },
  custom: {
    id: 'custom',
    name: 'Custom (Contact Us)',
    polarProductId: null, // Custom billing handled via invoice or custom Polar checkout
    priceUsd: null,
    features: {
      syncCatalog: true,
      maxProducts: -1, // -1 or Infinity indicates unlimited/custom limits
      maxFaqs: -1,
      monthlyConversationsLimit: -1,
      orderStatusLookup: true,
      isCustom: true,
    },
  },
};

/**
 * Helper to get plan configuration. Defaults to 'free' if the plan is not found.
 */
export function getPlanConfig(planId: string | null | undefined): PlanConfig {
  if (!planId) return PRICING_PLANS.free;
  return PRICING_PLANS[planId as PlanTier] || PRICING_PLANS.free;
}
