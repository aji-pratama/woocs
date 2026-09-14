
import { embedMany } from 'ai';
import { openai } from '@ai-sdk/openai';
import { db, client } from '../src/db/client';
import { stores, products, faqs } from '../src/db/schema/stores';
import { eq } from 'drizzle-orm';

const STORE_ID = process.argv[2];

if (!STORE_ID) {
  console.error("Usage: npx tsx api/scripts/seed.ts <store_id>");
  process.exit(1);
}

if (!process.env.OPENAI_API_KEY) {
  console.error("Error: OPENAI_API_KEY is not set in your environment or backend/.env file.");
  process.exit(1);
}

async function run() {
  console.log(`Checking store ${STORE_ID}...`);
  const [store] = await db.select().from(stores).where(eq(stores.id, STORE_ID));
  if (!store) {
    console.error(`Store ${STORE_ID} not found in database.`);
    process.exit(1);
  }

  const dummyProducts = [
    {
      wcId: 101,
      name: "Classic Cotton T-Shirt",
      description: "A comfortable, breathable 100% cotton t-shirt. Perfect for everyday wear.",
      price: "19.99",
      stockStatus: "instock",
      stockQuantity: 100,
      categories: ["Clothing", "T-Shirts"],
      tags: ["cotton", "casual"],
    },
    {
      wcId: 102,
      name: "Waterproof Hiking Boots",
      description: "Durable and waterproof hiking boots with excellent ankle support and grip for rough terrains.",
      price: "89.50",
      stockStatus: "instock",
      stockQuantity: 45,
      categories: ["Footwear", "Outdoor"],
      tags: ["hiking", "waterproof", "boots"],
    },
    {
      wcId: 103,
      name: "Noise-Cancelling Wireless Headphones",
      description: "Over-ear wireless headphones with active noise cancellation and 30-hour battery life.",
      price: "149.00",
      stockStatus: "outofstock",
      stockQuantity: 0,
      categories: ["Electronics", "Audio"],
      tags: ["headphones", "wireless", "audio"],
    }
  ];

  const dummyFaqs = [
    {
      question: "What is your return policy?",
      answer: "We offer a 30-day return policy for all unworn and unused items in their original packaging. Please contact support to initiate a return.",
    },
    {
      question: "Do you ship internationally?",
      answer: "Yes, we ship to most countries worldwide. International shipping usually takes 7-14 business days.",
    },
    {
      question: "How can I track my order?",
      answer: "Once your order has shipped, you will receive an email with a tracking number and a link to track your package.",
    }
  ];

  console.log("Generating embeddings for products...");
  const { embeddings: productEmbeddings } = await embedMany({
    model: openai.embedding('text-embedding-3-small', { dimensions: 1024 }),
    values: dummyProducts.map(p => `${p.name} - ${p.description} - ${p.categories.join(' ')}`),
  });

  console.log("Generating embeddings for FAQs...");
  const { embeddings: faqEmbeddings } = await embedMany({
    model: openai.embedding('text-embedding-3-small', { dimensions: 1024 }),
    values: dummyFaqs.map(f => `${f.question} - ${f.answer}`),
  });

  console.log("Inserting products into database...");
  for (let i = 0; i < dummyProducts.length; i++) {
    const product = dummyProducts[i];
    await db.insert(products).values({
      storeId: store.id,
      ...product,
      embedding: productEmbeddings[i],
    }).onConflictDoUpdate({
      target: [products.storeId, products.wcId],
      set: {
        name: product.name,
        description: product.description,
        price: product.price,
        stockStatus: product.stockStatus,
        stockQuantity: product.stockQuantity,
        embedding: productEmbeddings[i],
      }
    });
  }

  console.log("Inserting FAQs into database...");
  for (let i = 0; i < dummyFaqs.length; i++) {
    const faq = dummyFaqs[i];
    await db.insert(faqs).values({
      storeId: store.id,
      ...faq,
      embedding: faqEmbeddings[i],
    });
  }

  console.log("Dummy data successfully seeded!");
  await client.end();
}

run().catch(e => {
  console.error("Seeding failed:", e);
  process.exit(1);
});
