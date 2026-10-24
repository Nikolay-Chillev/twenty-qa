import { randomUUID } from 'node:crypto';

import type { Page } from '@playwright/test';

import type { ViewsApi } from '../../src/api/views';
import { companyInput } from '../../src/data/factories';
import { type Api, expect, test } from '../../src/fixtures';
import type { Company } from '../../src/schemas/records';
import { COMPANIES, RecordIndexPage } from '../../src/ui/record-table';

/** A prefix in Cyrillic that keeps a test's records and views apart from everyone else's. */
const newTag = (): string => `И${randomUUID().slice(0, 6)}`;

/** Creates companies with these names, each prefixed with the tag. */
async function companiesNamed(api: Api, tag: string, names: string[]): Promise<Company[]> {
  return api.companies.createMany(names.map((name) => companyInput({ name: `${tag} ${name}` })));
}

/**
 * Opens the companies table on its own view, "All Companies". Twenty opens
 * /objects/companies on the first view in the list, and a view saved in the UI goes
 * first, so without the view's id a test could land on a view another test just saved.
 */
async function openCompanies(page: Page, views: ViewsApi): Promise<RecordIndexPage> {
  const index = await views.index('company');
  return new RecordIndexPage(page, COMPANIES).openView(index.id);
}

const idsOf = (companies: Company[]): string[] => companies.map((company) => company.id);

test.describe('filters and sorts', () => {
  test('a Cyrillic name filter ignores case and finds what the API finds', async ({
    page,
    api,
    views,
  }) => {
    const tag = newTag();
    await companiesNamed(api, tag, ['Гама', 'гама ЕООД', 'Бета']);
    const companies = await openCompanies(page, views);

    await companies.views.filter('Name', `${tag} ГАМА`);

    const { records } = await api.companies.list({ filter: `name[ilike]:"%${tag} ГАМА%"` });
    expect(records.map((company) => company.name).sort()).toEqual(
      [`${tag} Гама`, `${tag} гама ЕООД`].sort(),
    );
    await expect
      .poll(async () => (await companies.table.ids()).sort())
      .toEqual(idsOf(records).sort());
  });

  test('sorting by name shows the companies in the order the API sorts them', async ({
    page,
    api,
    views,
  }) => {
    const tag = newTag();
    await companiesNamed(api, tag, ['Бета', 'Ябълка', 'Алфа', 'Гама']);
    const companies = await openCompanies(page, views);

    await companies.views.filter('Name', tag);
    await companies.views.sort('Name', 'Descending');

    const { records } = await api.companies.list({
      filter: `name[like]:"%${tag}%"`,
      orderBy: 'name[DescNullsLast]',
    });
    expect(records.map((company) => company.name)).toEqual(
      ['Ябълка', 'Гама', 'Бета', 'Алфа'].map((name) => `${tag} ${name}`),
    );
    await expect.poll(() => companies.table.ids()).toEqual(idsOf(records));
  });
});

test.describe('saved views', () => {
  test('a saved view keeps its filter and sort after a reload, for the member too', async ({
    page,
    memberPage,
    api,
    views,
  }) => {
    const tag = newTag();
    const created = await companiesNamed(api, tag, ['Алфа', 'Бета', 'Гама']);
    const companies = await openCompanies(page, views);
    await companies.views.filter('Name', tag);
    await companies.views.sort('Name', 'Descending');

    const id = await companies.views.saveAsNewView(`Изглед ${tag}`);
    views.removeAfterTest(id);

    expect(await views.get(id)).toMatchObject({
      name: `Изглед ${tag}`,
      visibility: 'WORKSPACE',
      viewFilters: [{ operand: 'CONTAINS', value: tag }],
      viewSorts: [{ direction: 'DESC' }],
    });
    // Гама, Бета, Алфа: the reverse of the order they were created in.
    const descending = idsOf(created).toReversed();

    await page.reload();
    await expect(companies.views.picker).toContainText(`Изглед ${tag}`);
    await expect.poll(() => companies.table.ids()).toEqual(descending);

    // The member finds the view in their own list of views.
    const theirs = await openCompanies(memberPage, views);
    await theirs.views.switchTo(`Изглед ${tag}`);
    await expect.poll(() => theirs.table.ids()).toEqual(descending);
  });

  test('Update view saves a changed filter into the view', async ({ page, api, views }) => {
    const tag = newTag();
    await api.companies.create(companyInput({ name: `${tag} Алфа` }));
    const gama = await api.companies.create(companyInput({ name: `${tag} Гама` }));
    const view = await views.create('company', {
      name: `Изглед ${tag}`,
      filters: [{ field: 'name', operand: 'CONTAINS', value: tag }],
    });
    const companies = await new RecordIndexPage(page, COMPANIES).openView(view.id);
    await expect(companies.table.rows).toHaveCount(2);

    await companies.views.changeFilter('Name', tag, `${tag} Гама`);
    await companies.views.updateView();

    await expect
      .poll(async () => (await views.get(view.id))?.viewFilters)
      .toEqual([expect.objectContaining({ operand: 'CONTAINS', value: `${tag} Гама` })]);
    await page.reload();
    await expect.poll(() => companies.table.ids()).toEqual([gama.id]);
  });

  test('a renamed view keeps its new name', async ({ page, views }) => {
    const tag = newTag();
    const view = await views.create('company', { name: `Изглед ${tag}` });
    const companies = await new RecordIndexPage(page, COMPANIES).openView(view.id);

    await companies.views.rename(`Изглед ${tag}`, `Преименуван ${tag}`);

    await expect.poll(async () => (await views.get(view.id))?.name).toBe(`Преименуван ${tag}`);
  });

  test('a deleted view is gone from the list of views', async ({ page, views }) => {
    const tag = newTag();
    const view = await views.create('company', { name: `Изглед ${tag}` });
    const companies = await new RecordIndexPage(page, COMPANIES).openView(view.id);

    await companies.views.delete(`Изглед ${tag}`);

    await expect.poll(() => views.get(view.id)).toBeNull();
    // The table moves to the first view in the list, whichever that is by now.
    await expect(page).not.toHaveURL(new RegExp(view.id));
    await companies.views.openList();
    await expect(companies.views.listed(`Изглед ${tag}`)).toHaveCount(0);
  });
});
