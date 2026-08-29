// Vitest setup file
import { beforeAll, afterAll } from 'vitest';

beforeAll(() => {
  // Set default env vars for testing
  process.env.DATABASE_URL = 'postgres://woocs:woocs_dev@127.0.0.1:5435/woocs_test';
  process.env.NODE_ENV = 'test';
});

afterAll(() => {
  // Cleanup
});
