// Vitest setup file
import { beforeAll, afterAll } from 'vitest';

// Set default env vars for testing BEFORE imports evaluate
process.env.DATABASE_URL = 'postgres://woocs:woocs_dev@localhost:5435/woocs_test';
process.env.NODE_ENV = 'test';

beforeAll(() => {
});

afterAll(() => {
  // Cleanup
});
