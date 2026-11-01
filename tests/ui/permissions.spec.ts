import { randomUUID } from 'node:crypto';

import type { Page } from '@playwright/test';

import type { FieldRights, ObjectRights } from '../../src/auth/roles';
import { storageStateOf } from '../../src/auth/users';
import { companyInput } from '../../src/data/factories';
import { expect, test } from '../../src/fixtures';
import type { Company } from '../../src/schemas/records';
import { CommandMenu } from '../../src/ui/command-menu';
import { RecordPage } from '../../src/ui/record-page';
import { COMPANIES, PAGE_LOAD, RecordIndexPage } from '../../src/ui/record-table';
import { SettingsPage } from '../../src/ui/settings';

const ISSUES = 'https://github.com/Nikolay-Chillev/twenty-qa/issues';

/** Sections of the settings for the workspace, which only admins have. */
const WORKSPACE_SECTIONS = ['General', 'Data model', 'Members', 'Developers'];

const READ_ONLY: ObjectRights = {
  canReadObjectRecords: true,
  canUpdateObjectRecords: false,
  canSoftDeleteObjectRecords: false,
  canDestroyObjectRecords: false,
};
const HIDDEN: FieldRights = { canReadFieldValue: false, canUpdateFieldValue: false };

test.describe('the settings', () => {
  test('an admin has the sections for the workspace', async ({ page }) => {
    const settings = new SettingsPage(page);
    await settings.open('profile');

    for (const section of WORKSPACE_SECTIONS) {
      await expect(settings.section(section)).toBeVisible({ timeout: PAGE_LOAD });
    }
  });

  test.describe('a member', () => {
    test.use({ storageState: storageStateOf('member') });

    test('has only their own sections', async ({ page }) => {
      const settings = new SettingsPage(page);
      await settings.open('profile');

      await expect(settings.section('Profile')).toBeVisible({ timeout: PAGE_LOAD });
      await expect(settings.section('Accounts')).toBeVisible();
      for (const section of WORKSPACE_SECTIONS) {
        await expect(settings.section(section)).toHaveCount(0);
      }
    });

    test("is sent back to their profile from the workspace's settings opened by address", async ({
      page,
    }) => {
      // Each address is a fresh page load of the whole app.
      test.slow();
      const settings = new SettingsPage(page);

      for (const path of ['members', 'members/roles', 'developers', 'developers/apis/new']) {
        await settings.open(path);
        await expect(page, `/settings/${path}`).toHaveURL(/\/settings\/profile$/, {
          timeout: PAGE_LOAD,
        });
      }
    });
  });
});

/** Opens the table on one company, shown by a filter on its name. */
async function openCompanies(page: Page, company: Company): Promise<RecordIndexPage> {
  const index = await new RecordIndexPage(page, COMPANIES).open(company.name);
  await expect(index.table.row(company.id)).toContainText(company.name);
  return index;
}

test.describe('companies', () => {
  test('an admin is offered to add, change and delete them', async ({ page, api }) => {
    const company = await api.companies.create(companyInput());
    const index = await openCompanies(page, company);
    const menu = new CommandMenu(page);

    await expect(page.getByRole('button', { name: 'Create Company' })).toBeVisible();
    await (await index.table.cell(company.id, 'Address')).click();
    await expect(page.getByPlaceholder('Address 1')).toBeVisible();
    await page.keyboard.press('Escape');
    await index.table.row(company.id).getByRole('checkbox').check();
    await menu.open();
    await expect(menu.action('Delete Company')).toBeVisible();
    await expect(menu.action('Import Companies')).toBeVisible();
  });

  test('a role that may only read them sees them, but is offered nothing else', async ({
    api,
    roles,
    signInWithRole,
  }) => {
    const role = await roles.create();
    await roles.limitObject(role, 'company', READ_ONLY);
    const company = await api.companies.create(companyInput());
    const page = await signInWithRole(role);
    const index = await openCompanies(page, company);
    const menu = new CommandMenu(page);

    await expect(page.getByRole('button', { name: 'Create Company' })).toHaveCount(0);
    await (await index.table.cell(company.id, 'Address')).click();
    await expect(page.getByPlaceholder('Address 1')).toHaveCount(0);
    await index.table.row(company.id).getByRole('checkbox').check();
    await menu.open();
    await expect(menu.action('Delete Company')).toHaveCount(0);
    await expect(menu.action('Import Companies')).toHaveCount(0);

    const record = await new RecordPage(page).open('company', company.id);
    await expect(record.heading).toHaveText(company.name);
    await menu.open();
    await expect(menu.action('Delete Company')).toHaveCount(0);
  });
});

test.describe('a field hidden from a role', () => {
  test('is not in the table, its columns or its filters', async ({
    api,
    roles,
    signInWithRole,
  }) => {
    const role = await roles.create();
    await roles.limitField(role, 'company', 'domainName', HIDDEN);
    const company = await api.companies.create(companyInput());
    const page = await signInWithRole(role);
    const index = await openCompanies(page, company);

    await expect(index.table.columnHeader('Address')).toBeVisible();
    await expect(index.table.columnHeader('Domain Name')).toHaveCount(0);
    await expect(index.table.row(company.id)).not.toContainText(company.domainName.primaryLinkUrl);
    const fields = await index.views.openFilterFields();
    await expect(fields.getByRole('button', { name: 'Address', exact: true })).toBeVisible();
    await expect(fields.getByRole('button', { name: 'Domain Name', exact: true })).toHaveCount(0);
  });

  test('does not show its value on the record page', async ({ api, roles, signInWithRole }) => {
    const role = await roles.create();
    await roles.limitField(role, 'company', 'domainName', HIDDEN);
    const company = await api.companies.create(companyInput());
    const page = await signInWithRole(role);

    await new RecordPage(page).open('company', company.id);

    await expect(
      page.getByText(company.address.addressCity, { exact: false }).first(),
    ).toBeVisible();
    await expect(page.getByText(company.domainName.primaryLinkUrl)).toHaveCount(0);
  });

  test.fail(
    'is not listed on the record page either',
    { annotation: { type: 'issue', description: `${ISSUES}/68` } },
    async ({ api, roles, signInWithRole }) => {
      const role = await roles.create();
      await roles.limitField(role, 'company', 'domainName', HIDDEN);
      const company = await api.companies.create(companyInput());
      const page = await signInWithRole(role);

      await new RecordPage(page).open('company', company.id);

      await expect(
        page.getByText(company.address.addressCity, { exact: false }).first(),
      ).toBeVisible();
      // Twenty lists it as an empty field, which reads as "no domain".
      await expect(page.getByText('Domain Name', { exact: true })).toHaveCount(0);
    },
  );
});

test.describe('a view the admin shared', () => {
  test('a member may delete it, as the Member role has the Views permission', async ({
    memberPage,
    views,
  }) => {
    const view = await views.create('company', { name: `QA view ${randomUUID()}` });
    const index = await new RecordIndexPage(memberPage, COMPANIES).openView(
      (await views.index('company')).id,
    );

    await index.views.delete(view.name);

    await expect.poll(() => views.get(view.id)).toBeNull();
  });

  test('a role without the Views permission is offered neither to edit nor to delete it', async ({
    roles,
    signInWithRole,
    views,
  }) => {
    const role = await roles.create({ canAccessAllTools: false });
    const view = await views.create('company', { name: `QA view ${randomUUID()}` });
    const page = await signInWithRole(role);
    const index = await new RecordIndexPage(page, COMPANIES).openView(
      (await views.index('company')).id,
    );

    const menu = await index.views.openMenu(view.name);

    await expect(menu.getByRole('menuitem', { name: 'Add to Favorite' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Edit' })).toHaveCount(0);
    await expect(menu.getByRole('menuitem', { name: 'Delete' })).toHaveCount(0);
  });
});
