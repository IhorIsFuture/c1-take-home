import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    setupFiles: ['./tests/support/setup.ts'],
    globals: false,
    isolate: true,
    fileParallelism: false,
    testTimeout: 10000,
    hookTimeout: 30000,
    clearMocks: true,
    restoreMocks: true
  }
});
