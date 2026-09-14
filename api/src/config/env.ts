import { z } from 'zod';

const EnvSchema = z.object({
  PORT: z.string().optional().transform(val => (val ? parseInt(val) : 8001)),
  APP_URL: z.string().default('http://localhost:8001'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().default('postgres://woocs:woocs_dev@127.0.0.1:5435/woocs'),
  
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_BASE_URL: z.string().default('https://openrouter.ai/api/v1'),
  AI_CHAT_MODEL: z.string().default('openai/gpt-4o-mini'),
  AI_EMBEDDING_MODEL: z.string().default('openai/text-embedding-3-small'),
  OPENAI_API_KEY: z.string().optional(),
  LLAMAPARSE_API_KEY: z.string().optional(),
  
  POLAR_API_URL: z.string().default('https://api.polar.sh'),
  POLAR_ACCESS_TOKEN: z.string().optional(),
  POLAR_WEBHOOK_SECRET: z.string().optional(),
  POLAR_PRO_PRODUCT_ID: z.string().default('prod_placeholder'),
  POLAR_PRODUCTS: z.string().default('{}'),
  POLAR_SUCCESS_URL: z.string().optional(),
  
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().transform(val => val ? parseInt(val) : 587).optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
});

// Parse process.env immediately. This will throw a clear ZodError on startup if a required field is missing.
const parsedEnv = EnvSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error("❌ Invalid environment variables:", parsedEnv.error.format());
  process.exit(1);
}

// Map dynamic fallback for POLAR_SUCCESS_URL if not provided
const envConfig = parsedEnv.data;
if (!envConfig.POLAR_SUCCESS_URL) {
  envConfig.POLAR_SUCCESS_URL = `${envConfig.APP_URL || 'http://localhost:8080'}/wp-admin/admin.php?page=woocs-settings&checkout=success`;
}

export const ENV = envConfig;
