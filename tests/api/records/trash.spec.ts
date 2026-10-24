import { companyInput, personInput } from '../../../src/data/factories';
import { type Api, expect, type GraphQLApi, test } from '../../../src/fixtures';

const ISSUES = 'https://github.com/Nikolay-Chillev/twenty-qa/issues';

const companiesVia = (via: 'REST' | 'GraphQL', apis: { api: Api; gql: GraphQLApi }) =>
  via === 'REST' ? apis.api.companies : apis.gql.companies;

for (const via of ['REST', 'GraphQL'] as const) {
  test.describe(`the trash over ${via}`, () => {
    test('a deleted company leaves the lists, waits in the trash and comes back', async ({
      api,
      gql,
    }) => {
      const companies = companiesVia(via, { api, gql });
      const company = await companies.create(companyInput());

      await companies.delete(company.id);

      expect((await api.companies.list({ filter: `id[eq]:"${company.id}"` })).totalCount).toBe(0);
      const trash = await api.companies.list({
        filter: `and(id[eq]:"${company.id}",deletedAt[is]:NOT_NULL)`,
      });
      expect(trash.records.map((found) => found.id)).toEqual([company.id]);

      const restored = await companies.restore(company.id);

      expect(restored).toMatchObject({ id: company.id, name: company.name, deletedAt: null });
      expect((await api.companies.get(company.id)).deletedAt).toBeNull();
    });

    test('a destroyed company is gone for good', async ({ api, gql }) => {
      const companies = companiesVia(via, { api, gql });
      const company = await companies.create(companyInput());

      await companies.destroy(company.id);

      await expect(companies.get(company.id)).rejects.toThrow(/Record not found/);
      await expect(companies.restore(company.id)).rejects.toThrow(/Record not found/);
    });
  });
}

test(
  'REST deletes for good unless soft_delete=true is sent',
  { annotation: { type: 'issue', description: `${ISSUES}/34` } },
  async ({ api }) => {
    const company = await api.companies.create(companyInput());

    const response = await api.rest.send('DELETE', `/rest/companies/${company.id}`);

    expect(response.status()).toBe(200);
    await expect(api.companies.restore(company.id)).rejects.toThrow(/Record not found/);
  },
);

test('a person keeps their company while it is in the trash and after it comes back', async ({
  api,
}) => {
  const company = await api.companies.create(companyInput());
  const person = await api.people.create(personInput({ companyId: company.id }));

  await api.companies.delete(company.id);
  expect((await api.people.get(person.id)).companyId).toBe(company.id);

  await api.companies.restore(company.id);
  expect((await api.people.get(person.id)).companyId).toBe(company.id);
});

test('destroying a company keeps its people, without the link', async ({ api }) => {
  const company = await api.companies.create(companyInput());
  const person = await api.people.create(personInput({ companyId: company.id }));

  await api.companies.destroy(company.id);

  expect((await api.people.get(person.id)).companyId).toBeNull();
});
