import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { ENV } from '../config/env.js';
import * as schema from './schema/index.js';

import { AsyncLocalStorage } from 'node:async_hooks';

interface RequestDbContext {
  client: ReturnType<typeof postgres>;
  db: ReturnType<typeof drizzle>;
}

const dbStorage = new AsyncLocalStorage<RequestDbContext>();

let _globalClient: ReturnType<typeof postgres> | null = null;
let _globalDb: ReturnType<typeof drizzle> | null = null;
let _globalUrl: string | null = null;

function createDbInstance(connectionString: string, isServerlessRequest: boolean) {
  const isSsl = connectionString.includes('sslmode=require') || connectionString.includes('neon.tech');
  const sql = postgres(connectionString, {
    prepare: false,
    max: isServerlessRequest ? 1 : ((process.env.NODE_ENV === 'test' || ENV.NODE_ENV === 'test') ? 1 : 5),
    ssl: isSsl ? 'require' : undefined,
    idle_timeout: isServerlessRequest ? 5 : undefined,
  });
  const dbInstance = drizzle(sql, { schema });
  return { client: sql, db: dbInstance };
}

/**
 * Execute an operation with a dedicated, request-scoped DB connection.
 * Completely eliminates Cloudflare Workers' "Cannot perform I/O on behalf of a different request" error.
 */
export async function withRequestDb<T>(connectionString: string, fn: () => Promise<T>): Promise<T> {
  const instance = createDbInstance(connectionString, true);
  return dbStorage.run(instance, fn);
}

export function getDb(): ReturnType<typeof drizzle> {
  const store = dbStorage.getStore();
  if (store) {
    return store.db;
  }
  const connectionString = process.env.DATABASE_URL || ENV.DATABASE_URL;
  if (!_globalClient || _globalUrl !== connectionString) {
    _globalUrl = connectionString;
    const instance = createDbInstance(connectionString, false);
    _globalClient = instance.client;
    _globalDb = instance.db;
  }
  return _globalDb!;
}

export function getDbClient(): ReturnType<typeof postgres> {
  const store = dbStorage.getStore();
  if (store) {
    return store.client;
  }
  getDb();
  return _globalClient!;
}

// Transparent proxy to support existing imports: `import { db } from '../db/client.js'`
export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_, prop) {
    const instance = getDb() as any;
    const val = instance[prop];
    return typeof val === 'function' ? val.bind(instance) : val;
  }
});

export const client = new Proxy({} as ReturnType<typeof postgres>, {
  get(_, prop) {
    const instance = getDbClient() as any;
    const val = instance[prop];
    return typeof val === 'function' ? val.bind(instance) : val;
  }
});
