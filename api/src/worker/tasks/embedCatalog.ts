import { db } from '../../db/client';
import { products, faqs } from '../../db/schema/stores';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { embed, embedMany } from 'ai';
import { openai } from '@ai-sdk/openai';
import { stores } from '../../db/schema/stores';
import { productVariations } from '../../db/schema/stores';
import { InferSelectModel } from 'drizzle-orm';

type Product = InferSelectModel<typeof products>;
type FAQ = InferSelectModel<typeof faqs>;

const EMBEDDING_BATCH_SIZE = 20;

/**
 * Build a text document for a product, following PRD Section 7 spec.
 */
function buildProductDocument(product: Product, variations: any[]): string {
  const lines: string[] = [];

  lines.push(`Product: ${product.name}`);

  const cats = product.categories as string[] || [];
  if (cats.length > 0) {
    lines.push(`Category: ${cats.join(', ')}`);
  }

  const tags = product.tags as string[] || [];
  if (tags.length > 0) {
    lines.push(`Tags: ${tags.join(', ')}`);
  }

  if (product.price) {
    lines.push(`Price: $${product.price}`);
  }

  if (product.stockQuantity != null) {
    lines.push(`Stock: ${product.stockStatus} (${product.stockQuantity} units)`);
  } else {
    lines.push(`Stock: ${product.stockStatus}`);
  }

  if (product.description) {
    lines.push(`Description: ${product.description}`);
  }

  if (variations.length > 0) {
    lines.push('Variations:');
    for (const v of variations) {
      const attrs = v.attributes || {};
      const attrStr = Object.entries(attrs).map(([k, val]) => `${k}: ${val}`).join(', ');
      const parts = [attrStr];
      if (v.price) parts.push(`Price: $${v.price}`);
      if (v.stockQuantity != null) parts.push(`Stock: ${v.stockQuantity}`);
      lines.push(`  - ${parts.join(' | ')}`);
    }
  }

  return lines.join('\n');
}

/**
 * Build a text document for an FAQ.
 */
function buildFaqDocument(faq: FAQ): string {
  return `Question: ${faq.question}\nAnswer: ${faq.answer}`;
}

/**
 * Embed catalog task handler.
 * Called by the worker when processing an `embed_catalog` task.
 */
export async function embedCatalog(storeId: string): Promise<{ productsEmbedded: number; faqsEmbedded: number }> {
  let productsEmbedded = 0;
  let faqsEmbedded = 0;

  // 1. Get all products without embeddings for this store
  const pendingProducts = await db.select()
    .from(products)
    .where(and(eq(products.storeId, storeId), isNull(products.embedding)));

  // Process in batches
  for (let i = 0; i < pendingProducts.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = pendingProducts.slice(i, i + EMBEDDING_BATCH_SIZE);

    // Get variations for each product in batch
    const documents: string[] = [];
    for (const product of batch) {
      const vars = await db.select().from(productVariations)
        .where(eq(productVariations.productId, product.id));
      documents.push(buildProductDocument(product, vars));
    }

    // Batch embed
    const { embeddings } = await embedMany({
      model: (openai.embedding as any)('text-embedding-3-small', { dimensions: 1024 }) as any,
      values: documents,
    });

    // Save embeddings
    for (let j = 0; j < batch.length; j++) {
      const vectorStr = `[${embeddings[j].join(',')}]`;
      await db.execute(
        sql`UPDATE store_product SET embedding = ${vectorStr}::vector WHERE id = ${batch[j].id}`
      );
      productsEmbedded++;
    }
  }

  // 2. Get all FAQs without embeddings for this store
  const pendingFaqs = await db.select()
    .from(faqs)
    .where(and(eq(faqs.storeId, storeId), isNull(faqs.embedding)));

  for (let i = 0; i < pendingFaqs.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = pendingFaqs.slice(i, i + EMBEDDING_BATCH_SIZE);
    const documents = batch.map(buildFaqDocument);

    const { embeddings } = await embedMany({
      model: (openai.embedding as any)('text-embedding-3-small', { dimensions: 1024 }) as any,
      values: documents,
    });

    for (let j = 0; j < batch.length; j++) {
      const vectorStr = `[${embeddings[j].join(',')}]`;
      await db.execute(
        sql`UPDATE store_faq SET embedding = ${vectorStr}::vector WHERE id = ${batch[j].id}`
      );
      faqsEmbedded++;
    }
  }

  // 3. Update store last_synced_at
  await db.update(stores)
    .set({ lastSyncedAt: new Date() })
    .where(eq(stores.id, storeId));

  return { productsEmbedded, faqsEmbedded };
}

export { buildProductDocument, buildFaqDocument };
