import { defineConfig, devices, type ReporterDescription } from '@playwright/test';

import { storageStateOf } from './src/auth/users';
import { config } from './src/config';

const ci = Boolean(process.env.CI);

const reporters: ReporterDescription[] = [
  ['list'],
  ['html', { open: 'never' }],
  ['allure-playwright', { resultsDir: 'allure-results' }],
];
// In CI, failures are also shown as annotations on the pull request.
if (ci) reporters.push(['github']);

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: ci,
  // In CI a failed test runs once more, so the report tells a flaky test from a broken
  // one; the run still fails, because a flaky test is a bug to fix, not to hide.
  retries: ci ? 1 : 0,
  failOnFlakyTests: ci,
  // Twenty's front end is a large single-page app; on a CI runner a page can take
  // several seconds to render after a navigation, more than the default 5.
  expect: { timeout: 10_000 },
  reporter: reporters,
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
      // Tests run as the admin unless they pick another role with test.use().
      use: { ...devices['Desktop Chrome'], storageState: storageStateOf('admin') },
      dependencies: ['setup'],
    },
  ],
});
