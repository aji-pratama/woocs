import { db } from '../db/client';
import { taskRecords } from '../db/schema/tasks';
import { eq, sql } from 'drizzle-orm';
import { embedCatalog } from './tasks/embedCatalog';

const POLL_INTERVAL_MS = 2000;

type TaskHandler = (kwargs: Record<string, any>) => Promise<any>;

const TASK_HANDLERS: Record<string, TaskHandler> = {
  embed_catalog: async (kwargs) => {
    const storeId = kwargs.store_id;
    if (!storeId) throw new Error('Missing store_id in task kwargs');
    return embedCatalog(storeId);
  },
};

/**
 * Claim the next pending task using SELECT ... FOR UPDATE SKIP LOCKED
 * to prevent race conditions with multiple workers.
 */
async function claimNextTask() {
  const result = await db.execute(sql`
    UPDATE task_records
    SET status = 'running', started_at = now()
    WHERE id = (
      SELECT id FROM task_records
      WHERE status = 'pending'
      ORDER BY enqueued_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `);

  const rows = result as any[];
  return rows.length > 0 ? rows[0] : null;
}

async function processTask(task: any) {
  const handler = TASK_HANDLERS[task.task_name];
  if (!handler) {
    console.error(`[Worker] Unknown task: ${task.task_name}`);
    await db.update(taskRecords)
      .set({ status: 'failed', traceback: `Unknown task: ${task.task_name}`, finishedAt: new Date() })
      .where(eq(taskRecords.id, task.id));
    return;
  }

  try {
    console.log(`[Worker] Processing task ${task.id} (${task.task_name})`);
    const result = await handler(task.kwargs || {});
    
    await db.update(taskRecords)
      .set({ status: 'completed', result, finishedAt: new Date() })
      .where(eq(taskRecords.id, task.id));
    
    console.log(`[Worker] Task ${task.id} completed:`, result);
  } catch (err: any) {
    console.error(`[Worker] Task ${task.id} failed:`, err);
    await db.update(taskRecords)
      .set({ status: 'failed', traceback: err.stack || String(err), finishedAt: new Date() })
      .where(eq(taskRecords.id, task.id));
  }
}

async function poll() {
  try {
    const task = await claimNextTask();
    if (task) {
      await processTask(task);
    }
  } catch (err) {
    console.error('[Worker] Poll error:', err);
  }
}

console.log('[Worker] Starting background task worker...');
console.log(`[Worker] Polling every ${POLL_INTERVAL_MS}ms`);
console.log(`[Worker] Registered handlers: ${Object.keys(TASK_HANDLERS).join(', ')}`);

setInterval(poll, POLL_INTERVAL_MS);

// Also run immediately on start
poll();
