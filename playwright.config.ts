import { defineConfig, devices } from '@playwright/test';

const packageManagerCommand = process.env.npm_execpath
  ? `${JSON.stringify(process.execPath)} ${JSON.stringify(process.env.npm_execpath)}`
  : 'pnpm';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],
  webServer: process.env.PLAYWRIGHT_NO_WEB_SERVER
    ? undefined
    : {
        command: `${packageManagerCommand} dev --hostname 127.0.0.1 --port 3000`,
        reuseExistingServer: true,
        url: 'http://127.0.0.1:3000',
      },
});
