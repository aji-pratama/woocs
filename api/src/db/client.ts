import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { ENV } from '../config/env.js';
import * as schema from './schema/index.js';

let _client: ReturnType<typeof postgres> | null = null;
let _db: ReturnType<typeof drizzle> | null = null;
let _currentUrl: string | null = null;

export function getDbClient() {
  const connectionString = process.env.DATABASE_URL || ENV.DATABASE_URL;
  if (!_client || _currentUrl !== connectionString) {
    _currentUrl = connectionString;
    const isSsl = connectionString.includes('sslmode=require') || connectionString.includes('neon.tech');
    _client = postgres(connectionString, {
      prepare: false, // For Supabase / Neon PgBouncer compatibility
      max: (process.env.NODE_ENV === 'test' || ENV.NODE_ENV === 'test') ? 1 : 5,
      ssl: isSsl ? 'require' : undefined,
    });
    _db = drizzle(_client, { schema });
  }
  return _client;
}

export function getDb() {
  getDbClient();
  return _db!;
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
