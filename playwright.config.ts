import { defineConfig } from '@playwright/test';

// The extension is loaded into Playwright's Chromium (branded Chrome no
// longer loads unpacked extensions from the command line). Build it first
// with WERA_E2E=1 (npm run e2e does), and point WERA_API at a Wera API
// with a test account (WERA_E2E_EMAIL / WERA_E2E_PASSWORD).
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { trace: 'retain-on-failure' },
});
