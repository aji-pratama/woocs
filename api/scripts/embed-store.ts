import { embedCatalog } from '../src/worker/tasks/embedCatalog';

async function main() {
  const storeId = process.argv[2] || 'bac68d00-dccc-4ff7-b6ab-92440c3ca758';
  console.log(`[Script] Embedding catalog for store: ${storeId}`);
  const result = await embedCatalog(storeId);
  console.log(`[Script] Successfully embedded:`, result);
}

main().catch((err) => {
  console.error('[Script] Failed:', err);
  process.exit(1);
});
