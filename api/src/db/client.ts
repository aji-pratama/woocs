import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index';

const connectionString = process.env.DATABASE_URL || 'postgres://woocs:woocs_dev@127.0.0.1:5435/woocs_api';

// PostgreSQL client
export const client = postgres(connectionString, {
  prepare: false, // For Supabase PgBouncer compatibility
  max: process.env.NODE_ENV === 'test' ? 1 : 10,
});

export const db = drizzle(client, { schema });
