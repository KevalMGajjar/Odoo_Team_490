import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  timeout: 60_000,
  use: {
    baseURL: process.env.FRONTEND_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    extraHTTPHeaders: {
      'Content-Type': 'application/json',
    },
  },
  projects: [
    {
      name: 'smoke',
      testDir: './tests/e2e/smoke',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'workflows',
      testDir: './tests/e2e/workflows',
      dependencies: ['smoke'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'uat',
      testDir: './tests/e2e/uat',
      dependencies: ['smoke'],
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
