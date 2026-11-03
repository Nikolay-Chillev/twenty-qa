import { companyInput, personInput, uniqueWord } from '../../src/data/factories';
import { expect, test } from '../../src/fixtures';
import { CommandMenu } from '../../src/ui/command-menu';
import { COMPANIES, PAGE_LOAD, RecordIndexPage } from '../../src/ui/record-table';

test.describe('search with Ctrl+K', () => {
  test('finds a company by a word of its name, and opens it', async ({ page, api }) => {
    const word = uniqueWord();
    const company = await api.companies.create(companyInput({ name: `Колибри ${word}` }));
    await new RecordIndexPage(page, COMPANIES).open();
    const menu = new CommandMenu(page);

    await menu.openWithKeyboard();
    await menu.search(word.toLowerCase());
    await menu.result(company.name, 'Company').click();

    await expect(page).toHaveURL(new RegExp(company.id), { timeout: PAGE_LOAD });
    await expect(page.getByRole('heading', { name: company.name })).toBeVisible();
  });

  test('shows a role only the objects it may read', async ({ api, roles, signInWithRole }) => {
    const role = await roles.create();
    await roles.limitObject(role, 'company', {
      canReadObjectRecords: false,
      canUpdateObjectRecords: false,
      canSoftDeleteObjectRecords: false,
      canDestroyObjectRecords: false,
    });
    const word = uniqueWord();
    const company = await api.companies.create(companyInput({ name: `Колибри ${word}` }));
    const person = await api.people.create(
      personInput({ name: { firstName: 'Ивайло', lastName: word } }),
    );
    const page = await signInWithRole(role);
    const menu = new CommandMenu(page);

    await menu.openWithKeyboard();
    await menu.search(word);

    await expect(
      menu.result(`${person.name.firstName} ${person.name.lastName}`, 'Person'),
    ).toBeVisible();
    await expect(menu.result(company.name, 'Company')).toHaveCount(0);
  });
});
