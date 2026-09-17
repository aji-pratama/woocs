import { db } from '../db/client.js';
import { taskRecords } from '../db/schema/tasks.js';
import { eq } from 'drizzle-orm';
import { embedCatalog } from './tasks/embedCatalog.js';
import { processKnowledgeDocument } from './tasks/processKnowledgeDocument.js';
import { logger } from '../common/logger.js';

export type TaskHandler = (kwargs: Record<string, any>) => Promise<any>;

export const TASK_HANDLERS: Record<string, TaskHandler> = {
  embed_catalog: async (kwargs) => {
    const storeId = kwargs.store_id;
    if (!storeId) throw new Error('Missing store_id in task kwargs');
    return embedCatalog(storeId);
  },
  process_knowledge_document: async (kwargs) => {
    const { store_id, document_id, type, source, raw_text } = kwargs;
    if (!store_id || !document_id || !type || !source) throw new Error('Missing required kwargs');
    return processKnowledgeDocument(store_id, document_id, type, source, raw_text);
  },
};

export async function processTask(task: any) {
  const taskName = task.taskName || task.task_name;
  const handler = TASK_HANDLERS[taskName];
  if (!handler) {
    logger.worker(`Unknown task type: ${taskName}`, {
      taskId: task.id,
      taskName,
      status: 'failed',
      error: `Unknown task: ${taskName}`,
    });
    await db.update(taskRecords)
      .set({ status: 'failed', traceback: `Unknown task: ${taskName}`, finishedAt: new Date() })
      .where(eq(taskRecords.id, task.id));
    return;
  }

  const startTime = Date.now();
  logger.worker(`Task started [${taskName}]`, {
    taskId: task.id,
    taskName,
    storeId: task.kwargs?.store_id,
    status: 'running',
  });

  try {
    const result = await handler(task.kwargs || {});
    const durationMs = Date.now() - startTime;
    
    await db.update(taskRecords)
      .set({ status: 'completed', result, finishedAt: new Date() })
      .where(eq(taskRecords.id, task.id));
    
    logger.worker(`Task completed [${taskName}]`, {
      taskId: task.id,
      taskName,
      storeId: task.kwargs?.store_id,
      status: 'completed',
      durationMs,
    });
    return result;
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    logger.worker(`Task failed [${taskName}]: ${err.message}`, {
      taskId: task.id,
      taskName,
      storeId: task.kwargs?.store_id,
      status: 'failed',
      durationMs,
      error: err.message,
      stack: err.stack,
    });
    await db.update(taskRecords)
      .set({ status: 'failed', traceback: err.stack || String(err), finishedAt: new Date() })
      .where(eq(taskRecords.id, task.id));
    throw err;
  }
}

/**
 * Direct execution of a task by ID.
 * Ideal for serverless contexts (e.g. Cloudflare Workers c.executionCtx.waitUntil).
 */
export async function executeTaskById(taskId: string) {
  try {
    const [task] = await db.select().from(taskRecords).where(eq(taskRecords.id, taskId)).limit(1);
    if (!task) {
      logger.warn(`Task ${taskId} not found for direct execution`, { component: 'Worker', taskId });
      return;
    }
    // Set status to running if still pending
    if (task.status === 'pending') {
      await db.update(taskRecords)
        .set({ status: 'running', startedAt: new Date() })
        .where(eq(taskRecords.id, taskId));
    }
    return await processTask(task);
  } catch (err: any) {
    logger.error(`Direct execution error for task ${taskId}: ${err.message}`, {
      component: 'Worker',
      taskId,
      stack: err.stack,
    });
  }
}

/**
 * Safely dispatch a background promise using Cloudflare Worker's executionCtx.waitUntil
 * without throwing when running under Node.js or Vitest.
 */
export function safeWaitUntil(c: any, promise: Promise<any>) {
  try {
    if (c?.executionCtx && typeof c.executionCtx.waitUntil === 'function') {
      c.executionCtx.waitUntil(promise);
    }
  } catch {
    // Runtime has no ExecutionContext (e.g. Node.js or test environment)
  }
}
