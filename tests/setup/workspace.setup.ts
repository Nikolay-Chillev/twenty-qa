import { expect, test as setup } from '@playwright/test';

import { type Role, storageStateOf, USERS, WORKSPACE_URL } from '../../src/auth/users';
import {
  apiKeyFor,
  readSavedWorkspace,
  saveWorkspace,
  signInAdmin,
  signInMember,
  workspaceIdOf,
} from '../../src/auth/workspace';
import { config } from '../../src/config';
import { Navigation } from '../../src/ui/navigation';
import { SignInPage } from '../../src/ui/sign-in';

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
    await new SignInPage(page, WORKSPACE_URL).signIn(USERS[role].email, password());

    // The first sign-in on a fresh environment also loads the whole front end and the
    // workspace metadata; on a CI runner the app rendered just after 5 seconds.
    await expect(new Navigation(page).workspaceMenu).toBeVisible({ timeout: 30_000 });
    await page.context().storageState({ path: storageStateOf(role) });
  });
}
