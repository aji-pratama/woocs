import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { ENV } from '../config/env';
import * as schema from './schema/index';

const connectionString = ENV.DATABASE_URL;

// PostgreSQL client
export const client = postgres(connectionString, {
  prepare: false, // For Supabase PgBouncer compatibility
  max: ENV.NODE_ENV === 'test' ? 1 : 10,
});

export const db = drizzle(client, { schema });
