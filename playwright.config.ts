import { defineConfig, devices, type ReporterDescription } from '@playwright/test';

import { storageStateOf, WORKSPACE_URL } from './src/auth/users';
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
  // Twenty serves its whole front end (about 700 files for every fresh browser context)
  // from one Node process; more browsers than this at once only slow each other down.
  workers: ci ? 2 : 4,
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
    // API calls go to the server; UI projects open the workspace's own address.
    baseURL: config.TWENTY_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    // Checks of the framework itself; they need neither Twenty nor a browser.
    { name: 'unit', testDir: './tests/unit' },
    // Creates the workspace, the users and their signed-in state for the other projects.
    // A sign-in may wait 20 s for a page stuck on its loader, reload it (src/ui/sign-in.ts)
    // and then wait up to 30 s for the app, so setup gets 120 s rather than the default 30.
    {
      name: 'setup',
      testDir: './tests/setup',
      testMatch: /.*\.setup\.ts/,
      timeout: 120_000,
    },
    { name: 'api', testDir: './tests/api', dependencies: ['setup'] },
    // UI tests run as the admin unless they pick another role with test.use().
    // A page load alone may take up to 30 s (src/ui/record-table.ts), so UI tests get 60.
    {
      name: 'chromium',
      testDir: './tests/ui',
      timeout: 60_000,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: WORKSPACE_URL,
        storageState: storageStateOf('admin'),
      },
      dependencies: ['setup'],
    },
    {
      name: 'firefox',
      testDir: './tests/ui',
      timeout: 60_000,
      use: {
        ...devices['Desktop Firefox'],
        baseURL: WORKSPACE_URL,
        storageState: storageStateOf('admin'),
      },
      dependencies: ['setup'],
    },
    {
      name: 'webkit',
      testDir: './tests/ui',
      timeout: 60_000,
      use: {
        ...devices['Desktop Safari'],
        baseURL: WORKSPACE_URL,
        storageState: storageStateOf('admin'),
      },
      dependencies: ['setup'],
    },
  ],
});
