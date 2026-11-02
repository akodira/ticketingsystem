import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end suite.
 *
 * Tests run against a locally started production-like server and a seeded
 * Supabase stack. No test targets a deployed environment or real customer data.
 *
 * Tests that need accounts read credentials from environment variables so the
 * same spec can run locally, in CI and against a preview deployment:
 *   E2E_CUSTOMER_EMAIL / E2E_CUSTOMER_PASSWORD
 *   E2E_AGENT_EMAIL    / E2E_AGENT_PASSWORD
 * A test whose credentials are absent is skipped, never silently passed.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'english-desktop',
      use: { ...devices['Desktop Chrome'], locale: 'en-US', extraHTTPHeaders: { 'Accept-Language': 'en-US,en' } },
    },
    {
      name: 'arabic-desktop',
      use: { ...devices['Desktop Chrome'], locale: 'ar-SA', extraHTTPHeaders: { 'Accept-Language': 'ar-SA,ar' } },
    },
    {
      name: 'arabic-mobile',
      use: { ...devices['Pixel 7'], locale: 'ar-SA', extraHTTPHeaders: { 'Accept-Language': 'ar-SA,ar' } },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run build && npm run start -- -p 3000',
        url: 'http://localhost:3000/en',
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
