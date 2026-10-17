import { defineConfig, devices } from '@playwright/test';

import { config } from './src/config';

const ci = Boolean(process.env.CI);

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: ci,
  // In CI a failed test runs once more, so the report tells a flaky test from a broken
  // one; the run still fails, because a flaky test is a bug to fix, not to hide.
  retries: ci ? 1 : 0,
  failOnFlakyTests: ci,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: config.TWENTY_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    // Checks of the framework itself; they need neither Twenty nor a browser.
    { name: 'unit', testDir: './tests/unit' },
    // Creates the workspace, the users and their signed-in state for the other projects.
    { name: 'setup', testDir: './tests/setup', testMatch: /.*\.setup\.ts/ },
    { name: 'api', testDir: './tests/api', dependencies: ['setup'] },
    {
      name: 'chromium',
      testDir: './tests/ui',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
  ],
});
