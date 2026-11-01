import { base32Bytes, totpCode } from '../../src/auth/totp';
import { turnOnTwoFactor } from '../../src/auth/two-factor';
import { WORKSPACE_URL } from '../../src/auth/users';
import { expect, test } from '../../src/fixtures';
import { Navigation } from '../../src/ui/navigation';
import { PAGE_LOAD } from '../../src/ui/record-table';
import { SignInPage } from '../../src/ui/sign-in';
import { TwoFactorSetupPage } from '../../src/ui/two-factor';

test.describe('two-factor sign-in', () => {
  test('a member turns it on with a code from their app, then signs in with the next one', async ({
    roles,
    signInWithRole,
    guestPage,
    newMember,
    password,
  }) => {
    const page = await signInWithRole(await roles.idOf('Member'));
    const setup = new TwoFactorSetupPage(page);
    const key = base32Bytes(await setup.open());
    // The previous step's code, which Twenty still accepts, so the current one is new
    // when the member signs in with it.
    await setup.confirm(totpCode(key, new Date(Date.now() - 30_000)));
    await expect(page.getByRole('link', { name: 'Authenticator App Active' })).toBeVisible();

    const signIn = new SignInPage(guestPage, WORKSPACE_URL);
    await signIn.signIn(newMember.email, password);
    await signIn.enterCode(totpCode(key));

    await expect(new Navigation(guestPage).workspaceMenu).toBeVisible({ timeout: PAGE_LOAD });
  });

  test('a wrong code keeps the member out', async ({ request, guestPage, newMember, password }) => {
    await turnOnTwoFactor(request, newMember, password);
    const signIn = new SignInPage(guestPage, WORKSPACE_URL);
    await signIn.signIn(newMember.email, password);

    await signIn.enterCode('000000');

    await expect(signIn.notice('Invalid verification code. Please try again.')).toBeVisible();
    await expect(signIn.codeStep).toBeVisible();
    await expect(guestPage).toHaveURL(`${WORKSPACE_URL}/welcome`);
  });
});
