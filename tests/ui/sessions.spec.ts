import { RestErrorBody } from '../../src/api/rest';
import { memberIdOf, removeFromWorkspace, signInMember } from '../../src/auth/workspace';
import { apiFor, expect, test } from '../../src/fixtures';
import { Navigation } from '../../src/ui/navigation';
import { PAGE_LOAD } from '../../src/ui/record-table';
import { SettingsPage } from '../../src/ui/settings';

test.describe('sessions', () => {
  test('logging out the other devices signs that browser out', async ({
    roles,
    signInWithRole,
  }) => {
    const member = await roles.idOf('Member');
    const here = await signInWithRole(member);
    const there = await signInWithRole(member);

    await new SettingsPage(here).logOutOtherDevices();
    await there.reload();
    await here.reload();

    await expect(there).toHaveURL(/\/welcome$/, { timeout: PAGE_LOAD });
    await expect(new Navigation(here).workspaceMenu).toBeVisible({ timeout: PAGE_LOAD });
  });

  test('a member taken out of the workspace loses access at once', async ({
    request,
    adminToken,
    password,
    newMember,
    roles,
    signInWithRole,
  }) => {
    const page = await signInWithRole(await roles.idOf('Member'));
    const token = await signInMember(request, password, adminToken, newMember);

    await removeFromWorkspace(request, adminToken, await memberIdOf(request, token));
    const response = await apiFor(request, token).rest.send('GET', '/rest/companies');
    await page.reload();

    expect(response.status()).toBe(401);
    expect(RestErrorBody.parse(await response.json()).messages).toEqual([
      'User or user workspace not found',
    ]);
    await expect(page).toHaveURL(/\/welcome$/, { timeout: PAGE_LOAD });
  });
});
