import { test as base } from '@playwright/test';

import { recordsApi, type RecordsApi } from '../api/records';
import { RestClient } from '../api/rest';
import { readSavedWorkspace, type SavedWorkspace, signInAdmin } from '../auth/workspace';
import { config } from '../config';
import { Mailbox } from '../mail/mailbox';
import { Mailpit } from '../mail/mailpit';
import { Company, type CompanyInput, Person, type PersonInput } from '../schemas/records';

export interface Api {
  rest: RestClient;
  companies: RecordsApi<Company, CompanyInput>;
  people: RecordsApi<Person, PersonInput>;
}

interface TestFixtures {
  /** REST API with the suite's API key (Admin role). */
  api: Api;
  /** REST API without any credentials. */
  anonymous: RestClient;
  /** A unique email address for this test, read through Mailpit. */
  mailbox: Mailbox;
}

interface WorkerFixtures {
  /** The workspace and API key the setup project saved. */
  workspace: SavedWorkspace;
  /** An access token of the admin, for /metadata calls an API key may not make. */
  adminToken: string;
  /** Password of the suite's users. */
  password: string;
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  workspace: [
    // eslint-disable-next-line no-empty-pattern -- Playwright requires the destructuring
    async ({}, use) => {
      const saved = readSavedWorkspace();
      if (!saved) throw new Error('No saved workspace; run the setup project first');
      await use(saved);
    },
    { scope: 'worker' },
  ],
  password: [
    // eslint-disable-next-line no-empty-pattern -- Playwright requires the destructuring
    async ({}, use) => {
      if (!config.TWENTY_PASSWORD)
        throw new Error('TWENTY_PASSWORD is not set; run scripts/start.sh');
      await use(config.TWENTY_PASSWORD);
    },
    { scope: 'worker' },
  ],
  adminToken: [
    async ({ playwright, password }, use) => {
      const request = await playwright.request.newContext({ baseURL: config.TWENTY_URL });
      await use(await signInAdmin(request, password));
      await request.dispose();
    },
    { scope: 'worker' },
  ],

  api: async ({ request, workspace }, use) => {
    const rest = new RestClient(request, workspace.apiKey);
    await use({
      rest,
      companies: recordsApi(rest, 'companies', Company),
      people: recordsApi(rest, 'people', Person),
    });
  },
  anonymous: async ({ request }, use) => {
    await use(new RestClient(request));
  },
  mailbox: async ({ request }, use) => {
    await use(new Mailbox(new Mailpit(request, config.MAILPIT_URL)));
  },
});

export { expect } from '@playwright/test';
