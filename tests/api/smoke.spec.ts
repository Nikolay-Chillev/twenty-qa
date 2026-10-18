import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { graphql } from '../../src/api/graphql';
import { RestClient, RestErrorBody } from '../../src/api/rest';
import { expect, test } from '../../src/fixtures';

test.describe('API smoke', { tag: '@smoke' }, () => {
  test('creates a company over REST and finds it with a filter', async ({ api }) => {
    const name = `Смоук ${randomUUID()} ООД`;
    const created = await api.companies.create({ name });

    const page = await api.companies.list({ filter: `name[eq]:"${name}"` });

    expect(page.records.map((company) => company.id)).toEqual([created.id]);
    expect(page.totalCount).toBe(1);
  });

  test('creates a person over REST and reads it back', async ({ api }) => {
    const email = `qa-${randomUUID()}@example.com`;
    const created = await api.people.create({
      name: { firstName: 'Иван', lastName: 'Петров' },
      emails: { primaryEmail: email },
    });

    const person = await api.people.get(created.id);

    expect(person.name).toEqual({ firstName: 'Иван', lastName: 'Петров' });
    expect(person.emails.primaryEmail).toBe(email);
  });

  test('answers GraphQL queries for records with the API key', async ({
    api,
    request,
    workspace,
  }) => {
    const created = await api.companies.create({ name: `GraphQL ${randomUUID()}` });

    const data = await graphql(request, '/graphql', {
      query: 'query($id: UUID!) { company(filter: { id: { eq: $id } }) { id name } }',
      variables: { id: created.id },
      token: workspace.apiKey,
      data: z.object({ company: z.object({ id: z.uuid(), name: z.string() }) }),
    });

    expect(data.company).toEqual({ id: created.id, name: created.name });
  });

  test('rejects a request without a token', async ({ anonymous }) => {
    const response = await anonymous.send('GET', '/rest/companies');

    // 403 rather than 401, while an invalid token gets 401 (finding #17).
    expect(response.status()).toBe(403);
    expect(RestErrorBody.parse(await response.json()).messages).toEqual([
      'Missing authentication token',
    ]);
  });

  test('rejects an invalid token', async ({ request }) => {
    const response = await new RestClient(request, 'not-a-token').send('GET', '/rest/companies');

    expect(response.status()).toBe(401);
    expect(RestErrorBody.parse(await response.json()).messages).toEqual(['Token invalid.']);
  });
});
