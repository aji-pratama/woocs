import { fileURLToPath } from 'url';
import path from 'path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { ENV } from '../config/env';
import * as schema from '../db/schema/index';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsFolder = path.resolve(__dirname, '../../drizzle');

function maskDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = '****';
    }
    return parsed.toString();
  } catch {
    return 'postgres://***:****@...';
  }
}

async function run() {
  console.log('\n========================================');
  console.log('🚀 WooCS.ai Database Initialization');
  console.log('========================================');
  console.log(`Target: ${maskDatabaseUrl(ENV.DATABASE_URL)}`);

  const isSsl = ENV.DATABASE_URL.includes('sslmode=require') || ENV.DATABASE_URL.includes('neon.tech');
  const client = postgres(ENV.DATABASE_URL, {
    prepare: false,
    max: 1,
    ssl: isSsl ? 'require' : undefined,
    onnotice: () => {}, // Suppress raw Postgres NOTICE logs
  });

  const db = drizzle(client, { schema });

  try {
    // 1. Check basic connection
    console.log('\n[1/4] Checking connection...');
    const [versionRes] = await client`SELECT version() as ver;`;
    console.log(`✅ Connected successfully!`);
    console.log(`    PostgreSQL Version: ${versionRes.ver.split(' on ')[0]}`);

    // 2. Ensure pgvector extension
    console.log('\n[2/4] Enabling pgvector extension...');
    await client`CREATE EXTENSION IF NOT EXISTS vector;`;
    const [extRes] = await client`SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';`;
    if (extRes) {
      console.log(`✅ pgvector extension active (version: ${extRes.extversion})`);
    } else {
      throw new Error('Failed to verify pgvector extension after creation.');
    }

    // 3. Run Drizzle migrations
    console.log('\n[3/4] Applying Drizzle migrations...');
    console.log(`    Migrations folder: ${migrationsFolder}`);
    await migrate(db, { migrationsFolder });
    console.log(`✅ Migrations applied successfully!`);

    // 4. Verify critical tables & vector columns
    console.log('\n[4/4] Verifying vector schemas and tables...');
    const tables = await client`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `;
    const tableNames = tables.map((t: any) => t.table_name);
    console.log(`    Found ${tableNames.length} tables: ${tableNames.join(', ')}`);

    const vectorCols = await client`
      SELECT table_name, column_name, udt_name 
      FROM information_schema.columns 
      WHERE udt_name = 'vector';
    `;
    console.log(`    Vector columns registered:`);
    for (const col of vectorCols) {
      console.log(`      - ${col.table_name}.${col.column_name} (${col.udt_name})`);
    }

    console.log('\n========================================');
    console.log('🎉 Database is 100% OPERATIONAL & VECTOR-READY!');
    console.log('========================================\n');
  } catch (err: any) {
    console.error('\n❌ Database initialization failed:');
    console.error(err.message || err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
