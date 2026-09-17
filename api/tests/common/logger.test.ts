import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger } from '../../src/common/logger.js';

describe('Logger & Observability', () => {
  let logSpy: any;
  let warnSpy: any;
  let errorSpy: any;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('logs info messages with tags and metadata', () => {
    logger.info('Test info message', { component: 'TEST', customField: 123 });
    expect(logSpy).toHaveBeenCalled();
    const output = logSpy.mock.calls[0][0];
    expect(output).toContain('[INFO]');
    expect(output).toContain('[TEST]');
    expect(output).toContain('Test info message');
    expect(output).toContain('"customField":123');
  });

  test('logs warn and error messages to correct console stream', () => {
    logger.warn('Warning test', { component: 'TEST' });
    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy.mock.calls[0][0]).toContain('[WARN]');

    logger.error('Error test', { component: 'TEST', error: 'Something failed' });
    expect(errorSpy).toHaveBeenCalled();
    expect(errorSpy.mock.calls[0][0]).toContain('[ERROR]');
  });

  test('sanitizes sensitive keys in metadata', () => {
    logger.info('Auth event', {
      api_key: 'sk-1234567890abcdef1234567890',
      password: 'super-secret-password',
      user: 'admin',
    });
    const output = logSpy.mock.calls[0][0];
    expect(output).not.toContain('super-secret-password');
    expect(output).toContain('[REDACTED]');
    expect(output).toContain('admin');
  });

  test('formats AI domain log events', () => {
    logger.ai('Chat completion generated', {
      model: 'openai/gpt-4o-mini',
      durationMs: 450,
      promptTokens: 120,
      completionTokens: 35,
      totalTokens: 155,
    });
    expect(logSpy).toHaveBeenCalled();
    const output = logSpy.mock.calls[0][0];
    expect(output).toContain('[AI]');
    expect(output).toContain('Chat completion generated');
    expect(output).toContain('450ms');
    expect(output).toContain('openai/gpt-4o-mini');
  });

  test('formats RAG domain log events', () => {
    logger.rag('Retrieval completed', {
      storeId: 'store-123',
      confidence: 0.92,
      contextUsed: 'retrieval',
      productsCount: 3,
      faqsCount: 1,
    });
    expect(logSpy).toHaveBeenCalled();
    const output = logSpy.mock.calls[0][0];
    expect(output).toContain('[RAG]');
    expect(output).toContain('0.92');
    expect(output).toContain('productsCount');
  });

  test('formats HTTP request logs', () => {
    logger.http('GET /api/widget/chat', {
      method: 'GET',
      path: '/api/widget/chat',
      status: 200,
      durationMs: 42,
    });
    expect(logSpy).toHaveBeenCalled();
    const output = logSpy.mock.calls[0][0];
    expect(output).toContain('[HTTP]');
    expect(output).toContain('GET /api/widget/chat');
    expect(output).toContain('42ms');
  });

  test('formats Worker task logs', () => {
    logger.worker('Task finished', {
      taskName: 'processKnowledgeDocument',
      taskId: 'task-abc',
      status: 'completed',
      durationMs: 820,
    });
    expect(logSpy).toHaveBeenCalled();
    const output = logSpy.mock.calls[0][0];
    expect(output).toContain('[Worker]');
    expect(output).toContain('processKnowledgeDocument');
  });
});
