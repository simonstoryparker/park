import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/pages',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4173/park/',
    launchOptions: process.env.PARK_CHROMIUM_PATH
      ? { executablePath: process.env.PARK_CHROMIUM_PATH }
      : undefined,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    {
      name: 'phone',
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
  ],
  webServer: {
    command: 'npm run preview -- --mode pages --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173/park/',
    reuseExistingServer: !process.env.CI,
  },
});
