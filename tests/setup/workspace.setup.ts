import { expect, test as setup } from '@playwright/test';

import { type Role, storageStateOf, USERS, WORKSPACE_NAME } from '../../src/auth/users';
import {
  apiKeyFor,
  readSavedWorkspace,
  saveWorkspace,
  signInAdmin,
  signInMember,
  workspaceIdOf,
} from '../../src/auth/workspace';
import { config } from '../../src/config';

setup.describe.configure({ mode: 'serial' });

function password(): string {
  if (!config.TWENTY_PASSWORD) {
    throw new Error('TWENTY_PASSWORD is not set; run scripts/start.sh, which adds it to .env');
  }
  return config.TWENTY_PASSWORD;
}

setup('create the workspace, a user per role and an API key', async ({ request }) => {
  const adminToken = await signInAdmin(request, password());
  await signInMember(request, password(), adminToken);
  const apiKey = await apiKeyFor(request, adminToken, readSavedWorkspace()?.apiKey);
  saveWorkspace({ id: await workspaceIdOf(request, adminToken), apiKey });

  const probe = await request.get('/rest/companies?limit=1', {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  expect(probe.status(), 'the saved API key works').toBe(200);
});

for (const role of ['admin', 'member'] satisfies Role[]) {
  setup(`sign in as ${role}`, async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('Email').fill(USERS[role].email);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByPlaceholder('Password').fill(password());
    await page.getByRole('button', { name: 'Sign in' }).click();

    // The first sign-in on a fresh environment also loads the whole front end and the
    // workspace metadata; on a CI runner the app rendered just after 5 seconds.
    await expect(page.getByRole('button', { name: WORKSPACE_NAME })).toBeVisible({
      timeout: 30_000,
    });
    await page.context().storageState({ path: storageStateOf(role) });
  });
}
