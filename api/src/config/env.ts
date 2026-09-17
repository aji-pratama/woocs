import { z } from 'zod';

const EnvSchema = z.object({
  PORT: z.string().optional().transform(val => (val ? parseInt(val) : 8001)),
  APP_URL: z.string().default('http://localhost:8001'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().default('postgres://woocs:woocs_dev@127.0.0.1:5435/woocs'),
  
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_BASE_URL: z.string().default('https://openrouter.ai/api/v1'),
  AI_CHAT_MODEL: z.string().default('nex-agi/nex-n2.5-mini:free'),
  AI_CHAT_MODELS: z.string().default('nex-agi/nex-n2.5-mini:free,meta-llama/llama-3.3-70b-instruct:free,mistralai/mistral-small-24b-instruct-2501:free,google/gemini-2.0-flash-exp:free,qwen/qwen-2.5-coder-32b-instruct:free'),
  AI_EMBEDDING_MODEL: z.string().default('liquid/lfm-2.5-embedding-350m:free'),
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

  HEALTH_CHECK_SECRET: z.string().default('woocs-secret-health-key-2026'),
  HEALTH_CHECK_PATH: z.string().default('/api/internal/health-check-9x7f2k'),
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
