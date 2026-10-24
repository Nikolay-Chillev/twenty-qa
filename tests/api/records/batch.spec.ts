import { randomUUID } from 'node:crypto';

import { companyInput } from '../../../src/data/factories';
import { expect, test } from '../../../src/fixtures';
import type { Api } from '../../../src/fixtures';

const ISSUES = 'https://github.com/Nikolay-Chillev/twenty-qa/issues';
const newTag = (): string => `Б${randomUUID().slice(0, 6)}`;

/** Creates `count` companies named after the tag, in requests of 100 (the limit is 200). */
async function companiesTagged(api: Api, tag: string, count: number) {
  const inputs = Array.from({ length: count }, (_, n) =>
    companyInput({ name: `${tag} ${String(n)}` }),
  );
  const created = [];
  for (let start = 0; start < inputs.length; start += 100) {
    created.push(...(await api.companies.createMany(inputs.slice(start, start + 100))));
  }
  return created;
}

test.describe('bulk operations', () => {
  test('creates many records in one request, in the order sent', async ({ api }) => {
    const tag = newTag();
    const names = ['Първа', 'Втора', 'Трета'].map((name) => `${tag} ${name}`);

    const created = await api.companies.createMany(names.map((name) => companyInput({ name })));

    expect(created.map((company) => company.name)).toEqual(names);
  });

  test('more than 200 records in one create request are refused', async ({ api }) => {
    const tag = newTag();
    const inputs = Array.from({ length: 201 }, (_, n) =>
      companyInput({ name: `${tag} ${String(n)}` }),
    );

    const response = await api.rest.send('POST', '/rest/batch/companies', { data: inputs });

    expect(response.status()).toBe(400);
    expect(await response.text()).toContain('Maximum number of records to upsert is 200');
    expect((await api.companies.list({ filter: `name[startsWith]:"${tag}"` })).totalCount).toBe(0);
  });

  test('updates only the records a filter matches', async ({ api }) => {
    const matching = newTag();
    const other = newTag();
    await companiesTagged(api, matching, 3);
    const untouched = await companiesTagged(api, other, 2);

    const updated = await api.companies.updateMany(`name[startsWith]:"${matching}"`, {
      address: { addressCity: 'Габрово' },
    });

    expect(updated).toHaveLength(3);
    expect(updated.map((company) => company.address.addressCity)).toEqual(Array(3).fill('Габрово'));
    const after = await api.companies.list({ filter: `name[startsWith]:"${other}"` });
    expect(after.records.map((company) => company.address.addressCity).sort()).toEqual(
      untouched.map((company) => company.address.addressCity).sort(),
    );
  });

  test('moves the records a filter matches to the trash, and restores them', async ({ api }) => {
    const tag = newTag();
    const created = await companiesTagged(api, tag, 3);
    const filter = `name[startsWith]:"${tag}"`;

    const deleted = await api.companies.deleteMany(filter);

    expect(deleted.toSorted()).toEqual(created.map((company) => company.id).toSorted());
    expect((await api.companies.list({ filter })).totalCount).toBe(0);
    const inTrash = await api.companies.list({ filter: `and(${filter},deletedAt[is]:NOT_NULL)` });
    expect(inTrash.totalCount).toBe(3);

    const restored = await api.companies.restoreMany(filter);

    expect(restored).toHaveLength(3);
    expect((await api.companies.list({ filter })).totalCount).toBe(3);
  });

  test('an update of more than 200 records at once is refused', async ({ api }) => {
    const tag = newTag();
    await companiesTagged(api, tag, 201);

    const response = await api.rest.send('PATCH', '/rest/companies', {
      params: { filter: `name[startsWith]:"${tag}"` },
      data: { address: { addressCity: 'Габрово' } },
    });

    expect(response.status()).toBe(400);
    expect(await response.text()).toContain('Cannot update more than 200 records at once');
  });

  test.fail(
    'a delete of more than 200 records at once is refused, as an update is',
    { annotation: { type: 'issue', description: `${ISSUES}/34` } },
    async ({ api }) => {
      const tag = newTag();
      await companiesTagged(api, tag, 201);

      const response = await api.rest.send('DELETE', '/rest/companies', {
        params: { filter: `name[startsWith]:"${tag}"`, soft_delete: true },
      });

      expect(response.status()).toBe(400);
    },
  );
});
