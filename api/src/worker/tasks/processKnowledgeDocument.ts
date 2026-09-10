import { db } from '../../db/client';
import { knowledgeDocuments, knowledgeChunks } from '../../db/schema/stores';
import { eq, sql } from 'drizzle-orm';
import { embedMany } from 'ai';
import { openai } from '@ai-sdk/openai';

const EMBEDDING_BATCH_SIZE = 20;

/**
 * Splits text into chunks of roughly maxTokens length, with overlap.
 * Uses a naive character-based split for the PoC.
 */
function chunkText(text: string, maxTokens: number = 1024, overlapTokens: number = 200): string[] {
  // Rough approximation: 1 token ~= 4 chars
  const chunkSize = maxTokens * 4;
  const overlapSize = overlapTokens * 4;
  const chunks: string[] = [];
  
  let i = 0;
  while (i < text.length) {
    let end = Math.min(i + chunkSize, text.length);
    // Try to break at a newline or space if possible
    if (end < text.length) {
      const nextNewline = text.lastIndexOf('\n', end);
      const nextSpace = text.lastIndexOf(' ', end);
      if (nextNewline > i + chunkSize / 2) end = nextNewline;
      else if (nextSpace > i + chunkSize / 2) end = nextSpace;
    }
    chunks.push(text.substring(i, end).trim());
    i = end - overlapSize;
    if (i < 0 || end === text.length) break;
  }
  return chunks.filter(c => c.length > 0);
}

/**
 * Mocks LlamaParse extraction. In a real app, this would upload to LlamaParse API.
 */
async function extractTextFromPDF(source: string): Promise<string> {
  const apiKey = process.env.LLAMAPARSE_API_KEY;
  if (!apiKey) {
    console.warn('No LLAMAPARSE_API_KEY found, using mock PDF extraction.');
    return `# Mock PDF Extraction for ${source}\n\nThis is a mock extraction because no LlamaParse key was provided.`;
  }
  // TODO: Implement actual LlamaParse REST API call
  return `# Extracted PDF for ${source}\n\nActual LlamaParse integration goes here.`;
}

/**
 * Fetches and extracts text from a URL.
 */
async function extractTextFromURL(source: string): Promise<string> {
  try {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    // Very naive HTML to Text for PoC
    const text = html.replace(/<style[^>]*>.*?<\/style>/gis, '')
                     .replace(/<script[^>]*>.*?<\/script>/gis, '')
                     .replace(/<[^>]+>/g, ' ')
                     .replace(/\s+/g, ' ')
                     .trim();
    return text.substring(0, 50000); // Limit size
  } catch (e: any) {
    console.error(`Failed to fetch URL ${source}:`, e);
    throw new Error(`Failed to crawl URL: ${e.message}`);
  }
}

export async function processKnowledgeDocument(
  storeId: string,
  documentId: string,
  type: 'url' | 'pdf',
  source: string
): Promise<{ chunksEmbedded: number }> {
  try {
    // 1. Update status to processing
    await db.update(knowledgeDocuments)
      .set({ status: 'processing', updatedAt: new Date() })
      .where(eq(knowledgeDocuments.id, documentId));

    // 2. Extract Text
    let rawText = '';
    if (type === 'url') {
      rawText = await extractTextFromURL(source);
    } else {
      rawText = await extractTextFromPDF(source);
    }

    // 3. Chunk Text
    const chunks = chunkText(rawText);
    
    // 4. Clear any existing chunks for this document (for Re-sync)
    await db.delete(knowledgeChunks).where(eq(knowledgeChunks.documentId, documentId));

    // 5. Embed and Save in batches
    let chunksEmbedded = 0;
    for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
      const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);
      
      const { embeddings } = await embedMany({
        model: openai.embedding('text-embedding-3-small', { dimensions: 1024 }),
        values: batch,
      });

      for (let j = 0; j < batch.length; j++) {
        const vectorStr = `[${embeddings[j].join(',')}]`;
        const [chunkRecord] = await db.insert(knowledgeChunks).values({
          documentId,
          content: batch[j],
        }).returning();

        // Update vector
        await db.execute(
          sql`UPDATE store_knowledgechunk SET embedding = ${vectorStr}::vector WHERE id = ${chunkRecord.id}`
        );
        chunksEmbedded++;
      }
    }

    // 6. Mark as completed
    await db.update(knowledgeDocuments)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(eq(knowledgeDocuments.id, documentId));

    return { chunksEmbedded };
  } catch (error: any) {
    // Mark as error
    await db.update(knowledgeDocuments)
      .set({ status: 'error', updatedAt: new Date() })
      .where(eq(knowledgeDocuments.id, documentId));
    throw error;
  }
}
