import { db } from '../db/client.js';
import { sql } from 'drizzle-orm';
import { TASK_HANDLERS, processTask } from './runner.js';

const POLL_INTERVAL_MS = 2000;

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
