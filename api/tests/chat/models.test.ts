import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../src/db/client';
import { stores } from '../../src/db/schema/stores';
import { chatSessions, chatMessages } from '../../src/db/schema/chat';
import { eq, desc } from 'drizzle-orm';

describe('Chat Models', () => {
  let storeId: string;

  beforeAll(async () => {
    const [store] = await db.insert(stores).values({
      apiKeyHash: 'chat_test_hash_' + Date.now(),
      wcUrl: 'https://test.com',
    }).returning();
    storeId = store.id;
  });

  afterAll(async () => {
    if (storeId) {
      await db.delete(stores).where(eq(stores.id, storeId));
    }
  });

  describe('ChatSession Model', () => {
    const sessionId = crypto.randomUUID();
    let internalSessionId: string;

    it('should create a chat session', async () => {
      const [session] = await db.insert(chatSessions).values({
        storeId,
        sessionId,
      }).returning();

      expect(session.id).toBeDefined();
      expect(session.storeId).toBe(storeId);
      expect(session.sessionId).toBe(sessionId);
      internalSessionId = session.id;
    });

    it('should enforce unique together constraint', async () => {
      await expect(
        db.insert(chatSessions).values({
          storeId,
          sessionId, // Same sessionId and storeId
        })
      ).rejects.toThrow(); // Should throw unique constraint error
    });

    describe('ChatMessage Model', () => {
      it('should create a user message', async () => {
        const [msg] = await db.insert(chatMessages).values({
          sessionId: internalSessionId,
          role: 'user',
          content: 'Hello there',
        }).returning();

        expect(msg.role).toBe('user');
        expect(msg.escalated).toBe(false);
        expect(msg.confidenceScore).toBeNull();
      });

      it('should create an assistant message with confidence', async () => {
        const [msg] = await db.insert(chatMessages).values({
          sessionId: internalSessionId,
          role: 'assistant',
          content: 'Here is your answer',
          confidenceScore: 0.87,
        }).returning();

        expect(msg.confidenceScore).toBe(0.87);
        expect(msg.escalated).toBe(false);
      });

      it('should create an escalated message', async () => {
        const [msg] = await db.insert(chatMessages).values({
          sessionId: internalSessionId,
          role: 'assistant',
          content: 'Escalation message',
          escalated: true,
          escalationReason: 'keyword_trigger',
        }).returning();

        expect(msg.escalated).toBe(true);
        expect(msg.escalationReason).toBe('keyword_trigger');
      });

      it('should query last N messages chronologically', async () => {
        // Insert 10 more messages
        for (let i = 0; i < 10; i++) {
          await db.insert(chatMessages).values({
            sessionId: internalSessionId,
            role: i % 2 === 0 ? 'user' : 'assistant',
            content: `Message ${i}`,
          });
        }

        // Get last 5 messages, ordered chronologically
        // First order by desc, limit 5, then reverse
        const last5Desc = await db.select()
          .from(chatMessages)
          .where(eq(chatMessages.sessionId, internalSessionId))
          .orderBy(desc(chatMessages.createdAt))
          .limit(5);
        
        const last5 = last5Desc.reverse();

        expect(last5).toHaveLength(5);
        expect(last5[0].content).toBe('Message 5');
        expect(last5[4].content).toBe('Message 9');
      });
    });
  });
});
