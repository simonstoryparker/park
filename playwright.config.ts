import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: {
    launchOptions: process.env.PARK_CHROMIUM_PATH
      ? { executablePath: process.env.PARK_CHROMIUM_PATH }
      : undefined,
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    video: 'on',
  },
  projects: [
    { name: 'phone', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
  ],
  webServer: [
    { command: 'npm run dev', url: 'http://localhost:5173', reuseExistingServer: true },
    {
      command: 'npm run worker:dev',
      url: 'http://localhost:8787/api/auth/challenge',
      reuseExistingServer: true,
    },
  ],
  reporter: [['list'], ['html', { open: 'never' }]],
});
