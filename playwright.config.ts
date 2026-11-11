import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  // Each test renders WebGL in software; more workers starve the CPU and timing-based tests
  // (orbs live 4 s) start missing. Real phones aren't starved like this.
  workers: process.env.CI ? 2 : 3,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    // Mobile-first: phone landscape on both browser engines used by our native WebViews.
    { name: 'iphone-landscape', use: { ...devices['iPhone 13 landscape'] } },
    { name: 'android-landscape', use: { ...devices['Pixel 7 landscape'] } },
  ],
  webServer: {
    // Production build with test hooks enabled (hooks are stripped from store builds).
    command: `VITE_TEST_HOOKS=true npx vite build && npx vite preview --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
