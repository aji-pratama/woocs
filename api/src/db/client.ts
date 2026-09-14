import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import postgres from 'postgres';
import { ENV } from '../config/env.js';
import * as schema from './schema/index.js';

type DatabaseInstance = ReturnType<typeof drizzlePostgres<typeof schema>>;

let _instance: DatabaseInstance | null = null;
let _cachedUrl: string | null = null;

/**
 * Creates a database instance tailored to the runtime and target database:
 * - Neon Serverless (Cloudflare Workers / Edge): stateless HTTPS fetch per query.
 * - PostgreSQL (Local Dev / Vitest / Background Worker): pooled TCP connections via postgres.js.
 */
function createDatabase(connectionString: string): DatabaseInstance {
  if (connectionString.includes('neon.tech')) {
    const rawNeon = neon(connectionString);
    // Adapter to support both tagged-template and conventional (query, params, options) calls from Drizzle
    const sql = (query: any, params?: any[], options?: any) => {
      return typeof query === 'string'
        ? rawNeon.query(query, params, options)
        : rawNeon(query, ...(params || []));
    };
    Object.assign(sql, rawNeon);
    return drizzleNeon(sql as any, { schema }) as unknown as DatabaseInstance;
  }

  // Local / standard PostgreSQL connection with automatic SSL enforcement for remote hosts
  const isLocal = connectionString.includes('127.0.0.1') || connectionString.includes('localhost');
  const isSsl = connectionString.includes('sslmode=require') || !isLocal;

  const sql = postgres(connectionString, {
    prepare: false, // Required for PgBouncer and serverless poolers
    max: process.env.NODE_ENV === 'test' ? 1 : 5,
    ssl: isSsl ? 'require' : undefined,
  });

  return drizzlePostgres(sql, { schema });
}

export function getDb(): DatabaseInstance {
  const connectionString = process.env.DATABASE_URL || ENV.DATABASE_URL;
  if (!_instance || _cachedUrl !== connectionString) {
    _cachedUrl = connectionString;
    _instance = createDatabase(connectionString);
  }
  return _instance;
}

// Transparent proxy for zero-overhead imports: `import { db } from '../db/client.js'`
export const db = new Proxy({} as DatabaseInstance, {
  get(_, prop) {
    const instance = getDb() as any;
    const value = instance[prop];
    return typeof value === 'function' ? value.bind(instance) : value;
  },
});
