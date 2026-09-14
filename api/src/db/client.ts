import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { ENV } from '../config/env.js';
import * as schema from './schema/index.js';

let _client: ReturnType<typeof postgres> | null = null;
let _db: ReturnType<typeof drizzle> | null = null;

export function getDbClient() {
  if (!_client) {
    const connectionString = process.env.DATABASE_URL || ENV.DATABASE_URL;
    const isSsl = connectionString.includes('sslmode=require') || connectionString.includes('neon.tech');
    _client = postgres(connectionString, {
      prepare: false, // For Supabase / Neon PgBouncer compatibility
      max: (process.env.NODE_ENV === 'test' || ENV.NODE_ENV === 'test') ? 1 : 5,
      ssl: isSsl ? 'require' : undefined,
    });
  }
  return _client;
}

export function getDb() {
  if (!_db) {
    const client = getDbClient();
    _db = drizzle(client, { schema });
  }
  return _db;
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
