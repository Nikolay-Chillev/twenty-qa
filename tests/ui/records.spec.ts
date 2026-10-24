import { companyInput, personInput } from '../../src/data/factories';
import { expect, test } from '../../src/fixtures';
import { Navigation } from '../../src/ui/navigation';
import { RecordPage } from '../../src/ui/record-page';
import { COMPANIES, PEOPLE, RecordIndexPage } from '../../src/ui/record-table';

test.describe('the companies table', () => {
  test('shows a company created over the API', async ({ page, api }) => {
    const company = await api.companies.create(companyInput());

    const companies = await new RecordIndexPage(page, COMPANIES).open(company.name);

    await expect(companies.table.link(company.name)).toBeVisible();
    await expect(companies.table.row(company.id)).toContainText(company.domainName.primaryLinkUrl);
  });

  test('saves a company added with the Create button', async ({ page, api }) => {
    const { name = '' } = companyInput();
    const companies = await new RecordIndexPage(page, COMPANIES).open(name);

    const id = await companies.create(name);

    await expect.poll(async () => (await api.companies.get(id)).name).toBe(name);
  });

  test('opens a company in the side panel from its name', async ({ page, api }) => {
    const company = await api.companies.create(companyInput());
    const companies = await new RecordIndexPage(page, COMPANIES).open(company.name);

    await companies.table.openRecord(company.name);

    await expect(page).toHaveURL(new RegExp(`panel=.*${company.id}`));
    await expect(page.getByRole('heading', { name: company.name })).toBeVisible();
  });
});

test.describe('the people table', () => {
  test('editing a cell changes the record', async ({ page, api }) => {
    const person = await api.people.create(personInput({ jobTitle: 'Счетоводител' }));
    const people = await new RecordIndexPage(page, PEOPLE).open(person.name.firstName);

    await people.table.edit(person.id, 'Job Title', 'Главен счетоводител');

    await expect
      .poll(async () => (await api.people.get(person.id)).jobTitle)
      .toBe('Главен счетоводител');
    await expect(people.table.row(person.id)).toContainText('Главен счетоводител');
  });
});

test.describe('record pages', () => {
  test("a person's page links to their company", async ({ page, api }) => {
    const company = await api.companies.create(companyInput());
    const person = await api.people.create(personInput({ companyId: company.id }));
    const record = await new RecordPage(page).open('person', person.id);

    await expect(record.heading).toHaveText(`${person.name.firstName} ${person.name.lastName}`);
    await record.relation(company.name).click();

    // The company opens in the side panel, next to the person's page.
    await expect(page).toHaveURL(new RegExp(`panel=.*${company.id}`));
    await expect(page.getByRole('heading', { name: company.name })).toBeVisible();
  });
});

test('the sidebar opens the table of each object', async ({ page }) => {
  await page.goto('/');
  const navigation = new Navigation(page);

  for (const [label, plural] of [
    ['Companies', 'companies'],
    ['People', 'people'],
    ['Opportunities', 'opportunities'],
  ] as const) {
    await navigation.open(label);
    await expect(page).toHaveURL(new RegExp(`/objects/${plural}`));
    // Companies and people open as a table, opportunities as a kanban; both can create.
    await expect(page.getByRole('button', { name: /^Create / })).toBeVisible();
  }
});
