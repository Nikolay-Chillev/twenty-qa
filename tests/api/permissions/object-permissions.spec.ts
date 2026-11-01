import { z } from 'zod';

import { graphql } from '../../../src/api/graphql';
import { expectDenied, expectForbidden } from '../../../src/api/refusals';
import type { ObjectRights, RolesApi } from '../../../src/auth/roles';
import { companyInput, personInput } from '../../../src/data/factories';
import { apiFor, expect, graphqlFor, test } from '../../../src/fixtures';

const ISSUES = 'https://github.com/Nikolay-Chillev/twenty-qa/issues';

const READ_ONLY: ObjectRights = {
  canReadObjectRecords: true,
  canUpdateObjectRecords: false,
  canSoftDeleteObjectRecords: false,
  canDestroyObjectRecords: false,
};
const NO_DELETE: ObjectRights = {
  canSoftDeleteObjectRecords: false,
  canDestroyObjectRecords: false,
};
const NO_ACCESS: ObjectRights = { ...READ_ONLY, canReadObjectRecords: false };

/** The token of a new API key whose role has these rights on companies. */
async function keyFor(roles: RolesApi, rights: ObjectRights): Promise<string> {
  const role = await roles.create();
  await roles.limitObject(role, 'company', rights);
  return (await roles.apiKey(role)).token;
}

test.describe('a role that may only read companies', () => {
  test('reads them over REST and GraphQL', async ({ request, api, roles }) => {
    const key = await keyFor(roles, READ_ONLY);
    const company = await api.companies.create(companyInput());

    expect((await apiFor(request, key).companies.get(company.id)).name).toBe(company.name);
    expect((await graphqlFor(request, key).companies.get(company.id)).name).toBe(company.name);
  });

  test('may not create, change or delete one, over REST or GraphQL', async ({
    request,
    api,
    roles,
  }) => {
    const key = await keyFor(roles, READ_ONLY);
    const reader = apiFor(request, key);
    const readerGql = graphqlFor(request, key);
    const company = await api.companies.create(companyInput());
    const path = `/rest/companies/${company.id}`;

    await expectDenied(await reader.rest.send('POST', '/rest/companies', { data: companyInput() }));
    await expectDenied(await reader.rest.send('PATCH', path, { data: { name: 'Променена' } }));
    await expectDenied(await reader.rest.send('DELETE', path, { params: { soft_delete: true } }));
    await expectForbidden(readerGql.companies.create(companyInput()));
    await expectForbidden(readerGql.companies.update(company.id, { name: 'Променена' }));
    await expectForbidden(readerGql.companies.delete(company.id));

    expect(await api.companies.get(company.id)).toEqual(company);
  });

  test.fail(
    'is refused with 403 Forbidden over REST, as over GraphQL',
    { annotation: { type: 'issue', description: `${ISSUES}/65` } },
    async ({ request, api, roles }) => {
      const reader = apiFor(request, await keyFor(roles, READ_ONLY));
      const company = await api.companies.create(companyInput());

      const response = await reader.rest.send('PATCH', `/rest/companies/${company.id}`, {
        data: { name: 'Променена' },
      });

      expect(response.status()).toBe(403);
    },
  );
});

test('a role that may not delete companies changes them, but cannot delete one', async ({
  request,
  api,
  roles,
}) => {
  const key = await keyFor(roles, NO_DELETE);
  const editor = apiFor(request, key);
  const editorGql = graphqlFor(request, key);
  const company = await api.companies.create(companyInput());
  const path = `/rest/companies/${company.id}`;

  await editor.companies.update(company.id, { name: `${company.name} (2)` });
  const renamed = await editorGql.companies.update(company.id, { name: `${company.name} (3)` });

  expect(renamed.name).toBe(`${company.name} (3)`);
  await expectDenied(await editor.rest.send('DELETE', path, { params: { soft_delete: true } }));
  await expectDenied(await editor.rest.send('DELETE', path, { params: { soft_delete: false } }));
  await expectForbidden(editorGql.companies.delete(company.id));
  await expectForbidden(editorGql.companies.destroy(company.id));
  expect((await api.companies.get(company.id)).deletedAt).toBeNull();
});

test.describe('a role without access to companies', () => {
  test('may not list or read them, over REST or GraphQL', async ({ request, api, roles }) => {
    const key = await keyFor(roles, NO_ACCESS);
    const company = await api.companies.create(companyInput());

    await expectDenied(await apiFor(request, key).rest.send('GET', '/rest/companies'));
    await expectDenied(
      await apiFor(request, key).rest.send('GET', `/rest/companies/${company.id}`),
    );
    await expectForbidden(graphqlFor(request, key).companies.get(company.id));
  });

  test('does not see a company through a person who works there', async ({
    request,
    api,
    roles,
  }) => {
    const key = await keyFor(roles, NO_ACCESS);
    const company = await api.companies.create(companyInput());
    const person = await api.people.create(personInput({ companyId: company.id }));

    // The person is there, with the id of their company and nothing else about it.
    const response = await apiFor(request, key).rest.send('GET', `/rest/people/${person.id}`, {
      params: { depth: 1 },
    });
    expect(response.status()).toBe(200);
    expect(await response.text()).not.toContain(company.name);

    await expectDenied(
      await apiFor(request, key).rest.send('GET', '/rest/people', {
        params: { filter: `company.name[eq]:"${company.name}"` },
      }),
    );
    await expectForbidden(
      graphql(request, '/graphql', {
        query: 'query($id: UUID!) { person(filter: { id: { eq: $id } }) { id company { name } } }',
        variables: { id: person.id },
        token: key,
        data: z.unknown(),
      }),
    );
  });
});
