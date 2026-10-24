import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { graphql } from '../../../src/api/graphql';
import type { ListOptions } from '../../../src/api/records';
import { companyInput, opportunityInput, personInput } from '../../../src/data/factories';
import { expect, test } from '../../../src/fixtures';
import type { Api } from '../../../src/fixtures';
import type { Company } from '../../../src/schemas/records';

/** A prefix in Cyrillic that keeps a test's records apart from everyone else's. */
const newTag = (): string => `Ф${randomUUID().slice(0, 6)}`;

/** Creates companies with these names, each prefixed with the tag. */
async function companiesNamed(api: Api, tag: string, names: string[]): Promise<Company[]> {
  return api.companies.createMany(names.map((name) => companyInput({ name: `${tag} ${name}` })));
}

async function namesMatching(api: Api, filter: string, orderBy?: string): Promise<string[]> {
  const page = await api.companies.list({ filter, ...(orderBy ? { orderBy } : {}) });
  return page.records.map((company) => company.name);
}

/** Ids of every page, following the cursors until the last page. */
async function allPages(api: Api, options: ListOptions): Promise<string[][]> {
  const pages: string[][] = [];
  let cursor: string | null | undefined;
  do {
    const result = await api.companies.list({
      ...options,
      ...(cursor ? { startingAfter: cursor } : {}),
    });
    pages.push(result.records.map((company) => company.id));
    cursor = result.pageInfo.hasNextPage ? result.pageInfo.endCursor : null;
  } while (cursor && pages.length < 10);
  return pages;
}

test.describe('filters', () => {
  test('equality finds the one record with that name', async ({ api }) => {
    const tag = newTag();
    await companiesNamed(api, tag, ['Алфа', 'Бета', 'Гама']);

    expect(await namesMatching(api, `name[eq]:"${tag} Бета"`)).toEqual([`${tag} Бета`]);
  });

  test('like matches case-sensitively and ilike ignores case, in Cyrillic too', async ({ api }) => {
    const tag = newTag();
    await companiesNamed(api, tag, ['Алфа', 'Бета']);

    expect(await namesMatching(api, `name[like]:"${tag} алфа"`)).toEqual([]);
    expect(await namesMatching(api, `name[ilike]:"${tag} АЛФА"`)).toEqual([`${tag} Алфа`]);
  });

  test('startsWith tells a Cyrillic letter from the Latin one that looks the same', async ({
    api,
  }) => {
    const id = randomUUID().slice(0, 6);
    await api.companies.createMany([
      companyInput({ name: `Т${id} кирилица` }),
      companyInput({ name: `T${id} latin` }),
    ]);

    expect(await namesMatching(api, `name[startsWith]:"Т${id}"`)).toEqual([`Т${id} кирилица`]);
  });

  test('in matches any value of a list', async ({ api }) => {
    const tag = newTag();
    await companiesNamed(api, tag, ['Алфа', 'Бета', 'Гама']);

    const names = await namesMatching(
      api,
      `name[in]:["${tag} Алфа","${tag} Гама"]`,
      'name[AscNullsFirst]',
    );

    expect(names).toEqual([`${tag} Алфа`, `${tag} Гама`]);
  });

  test('and, or and not combine conditions', async ({ api }) => {
    const tag = newTag();
    await companiesNamed(api, tag, ['Алфа', 'Бета', 'Гама']);
    const order = 'name[AscNullsFirst]';

    expect(
      await namesMatching(api, `or(name[eq]:"${tag} Алфа",name[eq]:"${tag} Гама")`, order),
    ).toEqual([`${tag} Алфа`, `${tag} Гама`]);
    expect(
      await namesMatching(api, `and(name[startsWith]:"${tag}",not(name[eq]:"${tag} Алфа"))`, order),
    ).toEqual([`${tag} Бета`, `${tag} Гама`]);
  });

  test('is NULL and is NOT_NULL find empty and filled fields', async ({ api }) => {
    const company = await api.companies.create(companyInput());
    const employed = await api.people.create(personInput({ companyId: company.id }));
    const freelancer = await api.people.create(personInput());
    const both = `id[in]:["${employed.id}","${freelancer.id}"]`;

    const withoutCompany = await api.people.list({ filter: `and(${both},companyId[is]:NULL)` });
    const withCompany = await api.people.list({ filter: `and(${both},companyId[is]:NOT_NULL)` });

    expect(withoutCompany.records.map((person) => person.id)).toEqual([freelancer.id]);
    expect(withCompany.records.map((person) => person.id)).toEqual([employed.id]);
  });

  test('composite fields filter by a part: a first name, an email address', async ({ api }) => {
    const person = await api.people.create(personInput());
    const others = await api.people.create(personInput({ name: person.name }));

    const byName = await api.people.list({
      filter: `and(name.firstName[eq]:"${person.name.firstName}",id[in]:["${person.id}","${others.id}"])`,
    });
    const byEmail = await api.people.list({
      filter: `emails.primaryEmail[eq]:"${person.emails.primaryEmail}"`,
    });

    expect(byName.totalCount).toBe(2);
    expect(byEmail.records.map((found) => found.id)).toEqual([person.id]);
  });

  test('a relation filters the people of one company', async ({ api }) => {
    const company = await api.companies.create(companyInput());
    const staff = await api.people.createMany([
      personInput({ companyId: company.id }),
      personInput({ companyId: company.id }),
    ]);
    await api.people.create(personInput());

    const page = await api.people.list({ filter: `companyId[eq]:"${company.id}"` });

    expect(page.records.map((person) => person.id).sort()).toEqual(
      staff.map((person) => person.id).sort(),
    );
  });

  test('an unknown comparator is refused with the list of valid ones', async ({ api }) => {
    const response = await api.rest.send('GET', '/rest/companies', {
      params: { filter: 'name[sortof]:"x"' },
    });

    expect(response.status()).toBe(400);
    expect(await response.text()).toContain('eq, neq, in, containsAny, is');
  });

  test('a filter on a field the object does not have is refused', async ({ api }) => {
    const response = await api.rest.send('GET', '/rest/companies', {
      params: { filter: 'turnover[gt]:1000' },
    });

    expect(response.status()).toBe(400);
    expect(await response.text()).toContain(`doesn't have any \\"turnover\\" field`);
  });

  test('GraphQL filters the same way as REST', async ({ api, request, workspace }) => {
    const tag = newTag();
    await companiesNamed(api, tag, ['Алфа', 'Бета', 'Гама']);

    const data = await graphql(request, '/graphql', {
      query: `query($filter: CompanyFilterInput) {
        companies(filter: $filter, orderBy: [{ name: AscNullsFirst }]) { edges { node { name } } }
      }`,
      variables: {
        filter: { and: [{ name: { startsWith: tag } }, { not: { name: { eq: `${tag} Алфа` } } }] },
      },
      token: workspace.apiKey,
      data: z.object({
        companies: z.object({ edges: z.array(z.object({ node: z.object({ name: z.string() }) })) }),
      }),
    });

    expect(data.companies.edges.map((edge) => edge.node.name)).toEqual(
      await namesMatching(
        api,
        `and(name[startsWith]:"${tag}",not(name[eq]:"${tag} Алфа"))`,
        'name[AscNullsFirst]',
      ),
    );
  });
});

test.describe('sorting', () => {
  test('names sort alphabetically, Latin before Cyrillic, whatever the case', async ({ api }) => {
    const tag = newTag();
    await companiesNamed(api, tag, ['Яна', 'борис', 'Ана', 'вера', 'Zed']);
    const expected = ['Zed', 'Ана', 'борис', 'вера', 'Яна'].map((name) => `${tag} ${name}`);

    expect(await namesMatching(api, `name[startsWith]:"${tag}"`, 'name[AscNullsFirst]')).toEqual(
      expected,
    );
    expect(await namesMatching(api, `name[startsWith]:"${tag}"`, 'name[DescNullsLast]')).toEqual(
      expected.toReversed(),
    );
  });

  test('empty values come first or last, as asked', async ({ api }) => {
    const tag = newTag();
    await api.opportunities.createMany([
      opportunityInput({ name: `${tag} март`, closeDate: '2027-03-01T00:00:00.000Z' }),
      opportunityInput({ name: `${tag} без дата`, closeDate: null }),
      opportunityInput({ name: `${tag} януари`, closeDate: '2027-01-01T00:00:00.000Z' }),
    ]);
    const sorted = async (orderBy: string) =>
      (await api.opportunities.list({ filter: `name[startsWith]:"${tag}"`, orderBy })).records.map(
        (deal) => deal.name.replace(`${tag} `, ''),
      );

    expect(await sorted('closeDate[AscNullsFirst]')).toEqual(['без дата', 'януари', 'март']);
    expect(await sorted('closeDate[AscNullsLast]')).toEqual(['януари', 'март', 'без дата']);
  });
});

test.describe('paging', () => {
  test('cursor paging returns every record exactly once', async ({ api }) => {
    const tag = newTag();
    const created = await companiesNamed(
      api,
      tag,
      ['1', '2', '3', '4', '5', '6', '7'].map((n) => `запис ${n}`),
    );
    const pages = await allPages(api, {
      filter: `name[startsWith]:"${tag}"`,
      limit: 3,
      orderBy: 'name[AscNullsFirst]',
    });
    const seen = pages.flat();
    const pageSizes = pages.map((page) => page.length);

    expect(pageSizes).toEqual([3, 3, 1]);
    expect(seen.toSorted()).toEqual(created.map((company) => company.id).toSorted());
  });

  test('ending_before goes back to the previous page', async ({ api }) => {
    const tag = newTag();
    await companiesNamed(api, tag, ['А', 'Б', 'В', 'Г', 'Д']);
    const options = {
      filter: `name[startsWith]:"${tag}"`,
      limit: 2,
      orderBy: 'name[AscNullsFirst]',
    };
    const first = await api.companies.list(options);
    const second = await api.companies.list({
      ...options,
      startingAfter: first.pageInfo.endCursor ?? '',
    });

    const back = await api.companies.list({
      ...options,
      endingBefore: second.pageInfo.startCursor ?? '',
    });

    expect(back.records.map((company) => company.name)).toEqual(
      first.records.map((company) => company.name),
    );
  });

  test('a page holds at most 200 records, whatever limit is asked for', async ({ api }) => {
    const tag = newTag();
    const names = Array.from({ length: 201 }, (_, n) => String(n).padStart(3, '0'));
    await companiesNamed(api, tag, names.slice(0, 100));
    await companiesNamed(api, tag, names.slice(100));

    const page = await api.companies.list({ filter: `name[startsWith]:"${tag}"`, limit: 250 });

    expect(page.records).toHaveLength(200);
    expect(page.totalCount).toBe(201);
    expect(page.pageInfo.hasNextPage).toBe(true);
  });

  test('an invalid cursor and a negative limit are refused', async ({ api }) => {
    const badCursor = await api.rest.send('GET', '/rest/companies', {
      params: { starting_after: 'not-a-cursor' },
    });
    const negativeLimit = await api.rest.send('GET', '/rest/companies', { params: { limit: -1 } });

    expect(badCursor.status()).toBe(400);
    expect(negativeLimit.status()).toBe(400);
  });
});
