import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './_testcode/specs/e2e',
  outputDir: './_testcode/debug/test-results',
  timeout: 30000,
  retries: 0,
  reporter: 'list',
  use: {
    trace: 'on-first-retry',
  },
});
