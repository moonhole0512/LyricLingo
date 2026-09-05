import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['_testcode/specs/**/*.spec.ts'],
    exclude: ['_testcode/specs/e2e/**'],
  },
});
