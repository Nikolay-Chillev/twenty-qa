import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { graphql } from '../../../src/api/graphql';
import { expectDenied, expectForbidden } from '../../../src/api/refusals';
import { ViewsApi } from '../../../src/api/views';
import { membershipOf } from '../../../src/auth/invitations';
import { USERS } from '../../../src/auth/users';
import { memberIdOf } from '../../../src/auth/workspace';
import { companyInput } from '../../../src/data/factories';
import { apiFor, expect, graphqlFor, test } from '../../../src/fixtures';

const ISSUES = 'https://github.com/Nikolay-Chillev/twenty-qa/issues';

const FAR_FUTURE = '2099-12-31T00:00:00.000Z';

test.describe('the Member role', () => {
  test('a member creates, changes and deletes records, as an admin does', async ({
    request,
    api,
    memberToken,
  }) => {
    const company = await apiFor(request, memberToken).companies.create(companyInput());

    const renamed = await graphqlFor(request, memberToken).companies.update(company.id, {
      name: `${company.name} (2)`,
    });
    await apiFor(request, memberToken).companies.destroy(company.id);

    expect(renamed.name).toBe(`${company.name} (2)`);
    expect((await api.rest.send('GET', `/rest/companies/${company.id}`)).status()).toBe(404);
  });

  test('a member may not see or change roles and API keys', async ({
    request,
    memberToken,
    roles,
  }) => {
    const asMember = (query: string, variables: Record<string, unknown> = {}) =>
      graphql(request, '/metadata', { query, variables, token: memberToken, data: z.unknown() });
    const memberRole = await roles.idOf('Member');

    await expectForbidden(asMember('{ getRoles { id } }'));
    await expectForbidden(
      asMember(
        'mutation($input: CreateRoleInput!) { createOneRole(createRoleInput: $input) { id } }',
        {
          input: { label: `QA role ${randomUUID()}` },
        },
      ),
    );
    await expectForbidden(
      asMember(
        `mutation($input: UpsertObjectPermissionsInput!) {
          upsertObjectPermissions(upsertObjectPermissionsInput: $input) { objectMetadataId }
        }`,
        { input: { roleId: memberRole, objectPermissions: [] } },
      ),
    );
    await expectForbidden(asMember('{ apiKeys { id } }'));
    await expectForbidden(
      asMember('mutation($input: CreateApiKeyInput!) { createApiKey(input: $input) { id } }', {
        input: { name: 'twenty-qa role test', expiresAt: FAR_FUTURE, roleId: memberRole },
      }),
    );
  });

  test('a member may not give themselves the Admin role', async ({
    request,
    adminToken,
    memberToken,
    roles,
  }) => {
    const refusal = graphql(request, '/metadata', {
      query: `mutation($memberId: UUID!, $roleId: UUID!) {
        updateWorkspaceMemberRole(workspaceMemberId: $memberId, roleId: $roleId) { id }
      }`,
      variables: {
        memberId: await memberIdOf(request, memberToken),
        roleId: await roles.idOf('Admin'),
      },
      token: memberToken,
      data: z.unknown(),
    });

    await expectForbidden(refusal);
    expect((await membershipOf(request, adminToken, USERS.member.email))?.role).toBe('Member');
  });

  test('a member may not add a webhook', async ({ request, api, memberToken }) => {
    const targetUrl = `https://example.com/qa-${randomUUID()}`;

    const response = await apiFor(request, memberToken).rest.send('POST', '/rest/webhooks', {
      data: { targetUrl, operations: ['*.*'] },
    });

    await expectDenied(response);
    // Webhooks are workspace settings, not records: REST lists them as a plain array.
    const webhooks = await api.rest.call(
      'GET',
      '/rest/webhooks',
      z.array(z.object({ targetUrl: z.string() })),
    );
    expect(webhooks.map((webhook) => webhook.targetUrl)).not.toContain(targetUrl);
  });

  // Records are refused with 403 since 2.56.0; settings over REST are not yet.
  test.fail(
    'a member adding a webhook is refused with 403 Forbidden, as for records',
    { annotation: { type: 'issue', description: `${ISSUES}/65` } },
    async ({ request, memberToken }) => {
      const response = await apiFor(request, memberToken).rest.send('POST', '/rest/webhooks', {
        data: { targetUrl: `https://example.com/qa-${randomUUID()}`, operations: ['*.*'] },
      });

      expect(response.status()).toBe(403);
    },
  );
});

test.describe('the Views permission', () => {
  // Member has it, through its access to all tools, so members may change and delete the
  // views the whole workspace shares; a role without it may only change its own.

  test('a member may delete a view someone else shared', async ({
    request,
    memberToken,
    views,
  }) => {
    const view = await views.create('company', { name: `QA view ${randomUUID()}` });

    await new ViewsApi(request, memberToken).destroy(view.id);

    expect(await views.get(view.id)).toBeNull();
  });

  test('a role without it may not delete a shared view, and may once given it', async ({
    request,
    roles,
    views,
  }) => {
    const role = await roles.create({ canAccessAllTools: false });
    const viewsOfKey = new ViewsApi(request, (await roles.apiKey(role)).token);
    const view = await views.create('company', { name: `QA view ${randomUUID()}` });

    expect(await expectForbidden(viewsOfKey.destroy(view.id))).toContain('modify this view');
    expect(await views.get(view.id)).not.toBeNull();

    await roles.grant(role, ['VIEWS']);
    await viewsOfKey.destroy(view.id);

    expect(await views.get(view.id)).toBeNull();
  });
});
