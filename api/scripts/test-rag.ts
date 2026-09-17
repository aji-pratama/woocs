import { RagService } from '../src/services/rag';
import { stores } from '../src/db/schema/stores';
import { chatSessions } from '../src/db/schema/chat';
import { db } from '../src/db/client';
import { eq } from 'drizzle-orm';

async function main() {
  const storeId = 'bac68d00-dccc-4ff7-b6ab-92440c3ca758';
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId));
  const [session] = await db.select().from(chatSessions).where(eq(chatSessions.storeId, storeId)).limit(1);

  console.log('Testing RAG Query for Store:', store.id);
  const res = await RagService.query(store, 'Ada produk apa saja?', session);
  console.log('RAG Query Result:', JSON.stringify(res, null, 2));
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
