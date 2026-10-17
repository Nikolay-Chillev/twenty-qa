import { expect, test } from '@playwright/test';

import { type Role, storageStateOf, USERS, WORKSPACE_NAME } from '../../src/auth/users';

for (const role of ['admin', 'member'] satisfies Role[]) {
  test.describe(`${role} session`, () => {
    test.use({ storageState: storageStateOf(role) });

    test(`the ${role} opens the app already signed in`, { tag: '@smoke' }, async ({ page }) => {
      const user = USERS[role];
      await page.goto('/settings/profile');

      await expect(page).toHaveURL(/\/settings\/profile$/);
      await expect(page.getByRole('button', { name: WORKSPACE_NAME })).toBeVisible();
      await expect(page.getByRole('textbox', { name: 'First Name' })).toHaveValue(user.firstName);
      await expect(page.getByRole('textbox', { name: 'Last Name' })).toHaveValue(user.lastName);
    });
  });
}
