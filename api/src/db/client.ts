import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import postgres from 'postgres';
import { ENV } from '../config/env.js';
import * as schema from './schema/index.js';

let _globalDb: any = null;
let _globalClient: any = null;
let _globalUrl: string | null = null;

function createDbInstance(connectionString: string) {
  const isNeon = connectionString.includes('neon.tech');
  if (isNeon) {
    // Neon Serverless HTTP driver for Cloudflare Workers:
    // Uses HTTPS fetch() per query instead of raw TCP sockets.
    // Completely eliminates "Cannot perform I/O on behalf of a different request" errors!
    const sql = neon(connectionString);
    const dbInstance = drizzleNeon(sql, { schema });
    return { client: sql, db: dbInstance };
  }

  // Standard postgres.js driver for local development and background workers
  const sql = postgres(connectionString, {
    prepare: false,
    max: (process.env.NODE_ENV === 'test' || ENV.NODE_ENV === 'test') ? 1 : 5,
  });
  const dbInstance = drizzlePostgres(sql, { schema });
  return { client: sql, db: dbInstance };
}

/**
 * Execute an operation with the appropriate DB connection.
 */
export async function withRequestDb<T>(connectionString: string, fn: () => Promise<T>): Promise<T> {
  // DB client handles both HTTP-based serverless and local pooled connection
  return fn();
}

export function getDb(): any {
  const connectionString = process.env.DATABASE_URL || ENV.DATABASE_URL;
  if (!_globalDb || _globalUrl !== connectionString) {
    _globalUrl = connectionString;
    const instance = createDbInstance(connectionString);
    _globalClient = instance.client;
    _globalDb = instance.db;
  }
  return _globalDb;
}

export function getDbClient(): any {
  if (!_globalClient) {
    getDb();
  }
  return _globalClient;
}

// Transparent proxy to support existing imports: `import { db } from '../db/client.js'`
export const db = new Proxy({} as ReturnType<typeof drizzlePostgres>, {
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
