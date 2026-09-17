import { db } from '../db/client';
import { stores, products, productVariations, faqs } from '../db/schema/stores';
import { subscriptions } from '../db/schema/billing';
import { eq } from 'drizzle-orm';
import * as crypto from 'node:crypto'; // Use node crypto for now, can be polyfilled in edge
import { SyncRequestInSchema } from '../schemas/store';
import { z } from 'zod';
import { appCache } from '../common/cache';

export class StoreService {
  static generateApiKey(): string {
    return crypto.randomBytes(24).toString('hex');
  }

  static hashApiKey(apiKey: string): string {
    return crypto.createHash('sha256').update(apiKey, 'utf8').digest('hex');
  }

  static getStoreNameFromUrl(url: string): string {
    try {
      const parsed = new URL(url);
      return parsed.hostname || url;
    } catch {
      return url;
    }
  }

  static async registerOrUpdateStore(
    wcUrl: string,
    apiKey?: string,
    merchantEmail?: string,
    wcConsumerKey?: string,
    wcConsumerSecret?: string
  ) {
    if (apiKey) {
      // Plugin-first flow or connecting an existing store
      const apiKeyHash = this.hashApiKey(apiKey);
      const existingStores = await db.select().from(stores).where(eq(stores.apiKeyHash, apiKeyHash));
      
      if (existingStores.length === 0) {
        return { store: null, rawApiKey: null, isValid: false };
      }
      
      const store = existingStores[0];
      
      // Update store details
      const [updatedStore] = await db.update(stores)
        .set({
          wcUrl,
          merchantEmail: merchantEmail || store.merchantEmail,
          wcConsumerKey: wcConsumerKey !== undefined ? wcConsumerKey : store.wcConsumerKey,
          wcConsumerSecret: wcConsumerSecret !== undefined ? wcConsumerSecret : store.wcConsumerSecret,
        })
        .where(eq(stores.id, store.id))
        .returning();

      appCache.delete(`store:id:${store.id}`);
      appCache.delete(`store:hash:${apiKeyHash}`);
      appCache.delete(`dashboard_stats:${store.id}`);
        
      return { store: updatedStore, rawApiKey: null, isValid: true };
    } else {
      // Web-first flow or pure new registration
      const rawKey = this.generateApiKey();
      const apiKeyHash = this.hashApiKey(rawKey);

      const [newStore] = await db.insert(stores).values({
        apiKeyHash,
        wcUrl,
        merchantEmail,
        wcConsumerKey,
        wcConsumerSecret,
      }).returning();

      // Free tier subscription — active immediately, no payment needed
      await db.insert(subscriptions).values({
        storeId: newStore.id,
        planKey: 'free',
        status: 'active',
      });

      return { store: newStore, rawApiKey: rawKey, isValid: true };
    }
  }
}

export class SyncService {
  static async processSyncPayload(storeId: string, payload: z.infer<typeof SyncRequestInSchema>) {
    let productsCount = 0;
    let variationsCount = 0;
    let faqsCount = 0;

    // Products
    for (const pIn of payload.products) {
      // Upsert product
      const [product] = await db.insert(products)
        .values({
          storeId,
          wcId: pIn.wc_id,
          name: pIn.name,
          description: pIn.description,
          price: pIn.price ? String(pIn.price) : null,
          stockStatus: pIn.stock_status,
          stockQuantity: pIn.stock_quantity,
          categories: pIn.categories,
          tags: pIn.tags,
        })
        .onConflictDoUpdate({
          target: [products.storeId, products.wcId],
          set: {
            name: pIn.name,
            description: pIn.description,
            price: pIn.price ? String(pIn.price) : null,
            stockStatus: pIn.stock_status,
            stockQuantity: pIn.stock_quantity,
            categories: pIn.categories,
            tags: pIn.tags,
          }
        })
        .returning();
      
      productsCount++;

      // Upsert variations
      for (const vIn of pIn.variations) {
        await db.insert(productVariations)
          .values({
            productId: product.id,
            wcVariationId: vIn.wc_variation_id,
            attributes: vIn.attributes,
            stockQuantity: vIn.stock_quantity,
            price: vIn.price ? String(vIn.price) : null,
          })
          .onConflictDoUpdate({
            target: [productVariations.productId, productVariations.wcVariationId],
            set: {
              attributes: vIn.attributes,
              stockQuantity: vIn.stock_quantity,
              price: vIn.price ? String(vIn.price) : null,
            }
          });
        variationsCount++;
      }
    }

    // Upsert FAQs (batch-fetch existing to avoid N+1 queries)
    if (payload.faqs.length > 0) {
      const existingFaqs = await db.select().from(faqs).where(eq(faqs.storeId, storeId));
      const faqMap = new Map(existingFaqs.map(f => [f.question, f]));

      for (const fIn of payload.faqs) {
        const match = faqMap.get(fIn.question);
        if (match) {
          if (match.answer !== fIn.answer) {
            await db.update(faqs).set({ answer: fIn.answer, updatedAt: new Date() }).where(eq(faqs.id, match.id));
          }
        } else {
          await db.insert(faqs).values({ storeId, question: fIn.question, answer: fIn.answer });
        }
        faqsCount++;
      }
    }

    // Invalidate caches when catalog or FAQs change
    appCache.delete(`dashboard_stats:${storeId}`);
    appCache.delete(`catalog_overview:${storeId}`);

    return { productsCount, variationsCount, faqsCount };
  }
}
