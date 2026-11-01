import { z } from 'zod';

import { graphql, GraphQLError } from '../../src/api/graphql';
import { OTHER_WORKSPACE, USERS } from '../../src/auth/users';
import { companyInput } from '../../src/data/factories';
import { apiFor, expect, graphqlFor, test } from '../../src/fixtures';

// Two customers: the suite's workspace and another one, each with its own admin and API
// key. Nothing done with the other workspace's key may reach the suite's records.

/** The error a GraphQL call failed with. */
async function failure(call: Promise<unknown>): Promise<GraphQLError> {
  const error = await call.then(
    () => undefined,
    (refusal: unknown) => refusal,
  );
  expect(error, 'the call fails').toBeInstanceOf(GraphQLError);
  return error as GraphQLError;
}

test.describe("another workspace's API key", () => {
  test('works on the records of its own workspace', async ({ request, api, otherWorkspace }) => {
    const other = apiFor(request, otherWorkspace.apiKey);
    const theirs = await other.companies.create(companyInput());

    expect((await other.companies.get(theirs.id)).name).toBe(theirs.name);
    expect((await api.rest.send('GET', `/rest/companies/${theirs.id}`)).status()).toBe(404);
  });

  test('cannot read a record of this workspace by its id', async ({
    request,
    api,
    otherWorkspace,
  }) => {
    const company = await api.companies.create(companyInput());

    const response = await apiFor(request, otherWorkspace.apiKey).rest.send(
      'GET',
      `/rest/companies/${company.id}`,
    );
    const error = await failure(
      graphqlFor(request, otherWorkspace.apiKey).companies.get(company.id),
    );

    expect(response.status()).toBe(404);
    expect(error.messages).toEqual(['Record not found']);
  });

  test('cannot change or delete a record of this workspace by its id', async ({
    request,
    api,
    otherWorkspace,
  }) => {
    const company = await api.companies.create(companyInput());
    const other = apiFor(request, otherWorkspace.apiKey);
    const otherGql = graphqlFor(request, otherWorkspace.apiKey);
    const path = `/rest/companies/${company.id}`;

    const statuses = [
      (await other.rest.send('PATCH', path, { data: { name: 'Чужда промяна' } })).status(),
      (await other.rest.send('DELETE', path, { params: { soft_delete: true } })).status(),
      (await other.rest.send('DELETE', path, { params: { soft_delete: false } })).status(),
    ];
    const errors = [
      await failure(otherGql.companies.update(company.id, { name: 'Чужда промяна' })),
      await failure(otherGql.companies.delete(company.id)),
      await failure(otherGql.companies.destroy(company.id)),
    ];

    expect(statuses).toEqual([404, 404, 404]);
    expect(errors.map((error) => error.codes)).toEqual([
      ['NOT_FOUND'],
      ['NOT_FOUND'],
      ['NOT_FOUND'],
    ]);
    expect(await api.companies.get(company.id)).toEqual(company);
  });

  test('neither finds nor changes records of this workspace through a filter', async ({
    request,
    api,
    otherWorkspace,
  }) => {
    const company = await api.companies.create(companyInput());
    const other = apiFor(request, otherWorkspace.apiKey);
    const filter = `name[eq]:"${company.name}"`;

    const found = await other.companies.list({ filter });
    const updated = await other.companies.updateMany(filter, { name: 'Чужда промяна' });
    const deleted = await other.companies.deleteMany(filter);
    const overGraphql = await graphql(request, '/graphql', {
      query: 'query($name: String!) { companies(filter: { name: { eq: $name } }) { totalCount } }',
      variables: { name: company.name },
      token: otherWorkspace.apiKey,
      data: z.object({ companies: z.object({ totalCount: z.number() }) }),
    });

    expect(found.totalCount).toBe(0);
    expect(updated).toEqual([]);
    expect(deleted).toEqual([]);
    expect(overGraphql.companies.totalCount).toBe(0);
    expect(await api.companies.get(company.id)).toEqual(company);
  });
});

test("this workspace's admin gets no token for another workspace's address", async ({
  request,
  password,
}) => {
  const error = await failure(
    graphql(request, '/metadata', {
      query: `mutation($email: String!, $password: String!, $origin: String!) {
        getLoginTokenFromCredentials(email: $email, password: $password, origin: $origin) {
          loginToken { token }
        }
      }`,
      variables: { email: USERS.admin.email, password, origin: OTHER_WORKSPACE.url },
      data: z.unknown(),
    }),
  );

  expect(error.codes).toEqual(['FORBIDDEN']);
  expect(error.messages).toEqual(['User is not a member of the workspace.']);
});
