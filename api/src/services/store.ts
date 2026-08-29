import { db } from '../db/client';
import { stores, products, productVariations, faqs } from '../db/schema/stores';
import { subscriptions } from '../db/schema/billing';
import { eq } from 'drizzle-orm';
import * as crypto from 'node:crypto'; // Use node crypto for now, can be polyfilled in edge
import { SyncRequestInSchema } from '../schemas/store';
import { z } from 'zod';

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
        
      return { store: updatedStore, rawApiKey: null, isValid: true };
    } else {
      // Web-first flow or pure new registration
      const rawKey = this.generateApiKey();
      const apiKeyHash = this.hashApiKey(rawKey);

      // Start transaction
      const result = await db.transaction(async (tx) => {
        const [newStore] = await tx.insert(stores).values({
          apiKeyHash,
          wcUrl,
          merchantEmail,
          wcConsumerKey,
          wcConsumerSecret,
        }).returning();

        // Subscriptions start trial
        await tx.insert(subscriptions).values({
          storeId: newStore.id,
          planKey: 'trial',
          status: 'trialing',
          active: true, // simplified for now
        });

        return newStore;
      });

      return { store: result, rawApiKey: rawKey, isValid: true };
    }
  }
}

export class SyncService {
  static async processSyncPayload(storeId: string, payload: z.infer<typeof SyncRequestInSchema>) {
    let productsCount = 0;
    let variationsCount = 0;
    let faqsCount = 0;

    // Use transaction for consistency
    await db.transaction(async (tx) => {
      // Products
      for (const pIn of payload.products) {
        // Upsert product
        const [product] = await tx.insert(products)
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
          await tx.insert(productVariations)
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

      // Upsert FAQs
      for (const fIn of payload.faqs) {
        // Since we don't have unique on (storeId, question), we'll do manual lookup/upsert or just basic delete-insert?
        // Wait, Django `update_or_create` on `question`. We should just query and update.
        const existingFaqs = await tx.select().from(faqs).where(eq(faqs.storeId, storeId));
        const match = existingFaqs.find(f => f.question === fIn.question);
        if (match) {
          await tx.update(faqs).set({ answer: fIn.answer }).where(eq(faqs.id, match.id));
        } else {
          await tx.insert(faqs).values({ storeId, question: fIn.question, answer: fIn.answer });
        }
        faqsCount++;
      }
    });

    return { productsCount, variationsCount, faqsCount };
  }
}
