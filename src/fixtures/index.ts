import {
  type APIRequestContext,
  test as base,
  type BrowserContext,
  expect,
  type Page,
} from '@playwright/test';

import { graphqlRecordsApi } from '../api/graphql-records';
import { type CrudApi, recordsApi, type RecordsApi } from '../api/records';
import { RestClient } from '../api/rest';
import { ViewsApi } from '../api/views';
import { listInvitations, membershipOf, removeInvitation } from '../auth/invitations';
import { RolesApi } from '../auth/roles';
import { storageStateOf, type TestUser, WORKSPACE_URL } from '../auth/users';
import {
  memberIdOf,
  readSavedWorkspace,
  removeFromWorkspace,
  type SavedWorkspace,
  signInAdmin,
  signInMember,
} from '../auth/workspace';
import { config } from '../config';
import { personName } from '../data/factories';
import { Mailbox } from '../mail/mailbox';
import { Mailpit } from '../mail/mailpit';
import {
  Company,
  type CompanyInput,
  Opportunity,
  type OpportunityInput,
  Person,
  type PersonInput,
} from '../schemas/records';
import { Navigation } from '../ui/navigation';
import { PAGE_LOAD } from '../ui/record-table';
import { SignInPage } from '../ui/sign-in';

export interface Api {
  rest: RestClient;
  companies: RecordsApi<Company, CompanyInput>;
  people: RecordsApi<Person, PersonInput>;
  opportunities: RecordsApi<Opportunity, OpportunityInput>;
}

export interface GraphQLApi {
  companies: CrudApi<Company, CompanyInput>;
  people: CrudApi<Person, PersonInput>;
  opportunities: CrudApi<Opportunity, OpportunityInput>;
}

/** The REST API with a token, e.g. an API key or a user's access token. */
export function apiFor(request: APIRequestContext, token: string): Api {
  const rest = new RestClient(request, token);
  return {
    rest,
    companies: recordsApi(rest, 'companies', Company),
    people: recordsApi(rest, 'people', Person),
    opportunities: recordsApi(rest, 'opportunities', Opportunity),
  };
}

/** The GraphQL API at `/graphql` with a token. */
export function graphqlFor(request: APIRequestContext, token: string): GraphQLApi {
  return {
    companies: graphqlRecordsApi(request, token, { singular: 'company', type: 'Company' }, Company),
    people: graphqlRecordsApi(request, token, { singular: 'person', type: 'Person' }, Person),
    opportunities: graphqlRecordsApi(
      request,
      token,
      { singular: 'opportunity', type: 'Opportunity' },
      Opportunity,
    ),
  };
}

interface TestFixtures {
  /** REST API with the suite's API key (Admin role). */
  api: Api;
  /** The same records through the GraphQL API (`/graphql`), with the same API key. */
  gql: GraphQLApi;
  /** REST API without any credentials. */
  anonymous: RestClient;
  /** A unique email address for this test, read through Mailpit. */
  mailbox: Mailbox;
  /** Saved views of the tables, with the same API key; the views a test makes go after it. */
  views: ViewsApi;
  /** Roles and API keys, made with the admin's token; the ones a test makes go after it. */
  roles: RolesApi;
  /** A second browser, signed in as the member, next to the admin's `page`. */
  memberPage: Page;
  /**
   * A member made for this test, with the mailbox's address and the suite's password,
   * so the test may sign it out or change its password; taken out of the workspace after.
   */
  newMember: TestUser;
  /** A second browser with no session, for someone who has no account yet. */
  guestPage: Page;
  /**
   * Gives `newMember` a role, e.g. one from `roles.create()`, and returns a browser signed
   * in as them through the sign-in page, next to the admin's `page`.
   */
  signInWithRole: (roleId: string) => Promise<Page>;
  /**
   * Someone to invite: the test's mailbox. After the test, their pending invitations
   * are removed, and so is the member they became if they joined.
   */
  invitee: Mailbox;
}

interface WorkerFixtures {
  /** The workspace and API key the setup project saved. */
  workspace: SavedWorkspace;
  /** An access token of the admin, for /metadata calls an API key may not make. */
  adminToken: string;
  /** An access token of the member, the user with the built-in Member role. */
  memberToken: string;
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

  memberToken: [
    async ({ playwright, password, adminToken }, use) => {
      const request = await playwright.request.newContext({ baseURL: config.TWENTY_URL });
      await use(await signInMember(request, password, adminToken));
      await request.dispose();
    },
    { scope: 'worker' },
  ],

  api: async ({ request, workspace }, use) => {
    await use(apiFor(request, workspace.apiKey));
  },
  gql: async ({ request, workspace }, use) => {
    await use(graphqlFor(request, workspace.apiKey));
  },
  roles: async ({ request, adminToken }, use) => {
    const roles = new RolesApi(request, adminToken);
    await use(roles);
    await roles.removeAll();
  },
  anonymous: async ({ request }, use) => {
    await use(new RestClient(request));
  },
  mailbox: async ({ request }, use) => {
    await use(new Mailbox(new Mailpit(request, config.MAILPIT_URL)));
  },
  views: async ({ request, workspace }, use) => {
    const views = new ViewsApi(request, workspace.apiKey);
    await use(views);
    await views.removeAll();
  },
  memberPage: async ({ browser }, use) => {
    const context = await browser.newContext({
      baseURL: WORKSPACE_URL,
      storageState: storageStateOf('member'),
    });
    await use(await context.newPage());
    await context.close();
  },
  newMember: async ({ request, mailbox, adminToken, password }, use) => {
    const user: TestUser = { role: 'member', email: mailbox.address, ...personName() };
    const memberId = await memberIdOf(
      request,
      await signInMember(request, password, adminToken, user),
    );
    await use(user);
    await removeFromWorkspace(request, adminToken, memberId);
  },
  guestPage: async ({ browser }, use) => {
    // An empty state of its own: a context made in a test otherwise takes the
    // project's, which signs it in as the admin.
    const context = await browser.newContext({
      baseURL: WORKSPACE_URL,
      storageState: { cookies: [], origins: [] },
    });
    await use(await context.newPage());
    await context.close();
  },
  signInWithRole: async ({ browser, request, roles, newMember, password, adminToken }, use) => {
    const contexts: BrowserContext[] = [];
    await use(async (roleId) => {
      const token = await signInMember(request, password, adminToken, newMember);
      await roles.assign(roleId, await memberIdOf(request, token));
      const context = await browser.newContext({
        baseURL: WORKSPACE_URL,
        storageState: { cookies: [], origins: [] },
      });
      contexts.push(context);
      const page = await context.newPage();
      await new SignInPage(page, WORKSPACE_URL).signIn(newMember.email, password);
      await expect(new Navigation(page).workspaceMenu).toBeVisible({ timeout: PAGE_LOAD });
      return page;
    });
    for (const context of contexts) await context.close();
  },
  invitee: async ({ request, mailbox, adminToken }, use) => {
    await use(mailbox);
    for (const invitation of await listInvitations(request, adminToken)) {
      if (invitation.email === mailbox.address) {
        await removeInvitation(request, adminToken, invitation.id);
      }
    }
    const membership = await membershipOf(request, adminToken, mailbox.address);
    if (membership) await removeFromWorkspace(request, adminToken, membership.memberId);
  },
});

export { expect } from '@playwright/test';
