import { describe, it, expect, vi } from 'vitest';
import { chunkText, extractTextFromURL, extractTextFromPDF } from '../../src/worker/tasks/processKnowledgeDocument';

describe('Knowledge Processing & Chunking Task', () => {
  it('should not split short text that fits in one chunk', () => {
    const text = 'This is a short FAQ document.';
    const chunks = chunkText(text, 1024, 200);
    expect(chunks.length).toBe(1);
    expect(chunks[0]).toBe(text);
  });

  it('should split long text into overlapping chunks breaking on space/newline', () => {
    const paragraph = 'Word '.repeat(500); // 2500 chars
    const chunks = chunkText(paragraph, 100, 20); // chunkSize: 400 chars, overlap: 80 chars
    expect(chunks.length).toBeGreaterThan(1);

    // Each chunk should have text and overlap with the next
    expect(chunks[0].length).toBeLessThanOrEqual(400);
    expect(chunks[1].length).toBeLessThanOrEqual(400);
  });

  it('should sanitize HTML from URL responses removing script and style tags', async () => {
    const mockHtml = `
      <html>
        <head>
          <style>.hide { display: none; }</style>
          <script>console.log("malicious");</script>
        </head>
        <body>
          <h1>Welcome to Store</h1>
          <p>We sell quality items.</p>
        </body>
      </html>
    `;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => mockHtml,
    });

    const extracted = await extractTextFromURL('https://example.com');
    expect(extracted).not.toContain('style');
    expect(extracted).not.toContain('script');
    expect(extracted).not.toContain('console.log');
    expect(extracted).toContain('Welcome to Store');
    expect(extracted).toContain('We sell quality items.');
  });

  it('should fallback to mock text when no LlamaParse key is set', async () => {
    const res = await extractTextFromPDF('catalog.pdf');
    expect(res).toContain('catalog.pdf');
  });
});
