import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema/*.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgres://woocs:woocs_dev@127.0.0.1:5435/woocs',
  },
  verbose: true,
  strict: true,
});
