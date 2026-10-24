import { randomUUID } from 'node:crypto';

import type { Browser, BrowserContextOptions, Page } from '@playwright/test';

import { requestPasswordReset, resetPassword } from '../../src/auth/password';
import { WORKSPACE_URL } from '../../src/auth/users';
import { expect, test } from '../../src/fixtures';
import { linkIn } from '../../src/mail/mailbox';
import { Navigation } from '../../src/ui/navigation';
import { PAGE_LOAD } from '../../src/ui/record-table';
import { PasswordResetPage, SignInPage } from '../../src/ui/sign-in';

// These tests start signed out and sign in a member made for each of them, so the
// suite's own users keep their sessions and passwords.
test.use({ storageState: { cookies: [], origins: [] } });

const newPassword = (): string => `Qa1-${randomUUID().slice(0, 12)}`;

type StorageState = Exclude<BrowserContextOptions['storageState'], string | undefined>;

/** Opens the app in another browser that has a copy of a session's cookies and storage. */
async function withCopyOf(
  browser: Browser,
  session: StorageState,
  check: (page: Page) => Promise<void>,
): Promise<void> {
  const context = await browser.newContext({ baseURL: WORKSPACE_URL, storageState: session });
  try {
    const page = await context.newPage();
    await page.goto('/objects/companies');
    await check(page);
  } finally {
    await context.close();
  }
}

test.describe('signing in', () => {
  test(
    'a member signs in with email and password',
    { tag: '@smoke' },
    async ({ page, newMember, password }) => {
      await new SignInPage(page).signIn(newMember.email, password);

      await expect(new Navigation(page).workspaceMenu).toBeVisible({ timeout: PAGE_LOAD });
    },
  );

  test('a wrong password is refused and opens nothing', async ({ page, newMember }) => {
    const signIn = new SignInPage(page);

    await signIn.signIn(newMember.email, 'Not-the-password-1');

    await expect(signIn.notice('Wrong password.')).toBeVisible();
    await page.goto('/objects/companies');
    await expect(page).toHaveURL(/\/welcome/);
  });

  test('an address without an account is offered to sign up, which needs an invitation', async ({
    page,
    mailbox,
  }) => {
    const signIn = await new SignInPage(page).open();

    await signIn.enterEmail(mailbox.address);
    await expect(signIn.signUpButton).toBeVisible();
    await signIn.password.fill(newPassword());
    await signIn.signUpButton.click();

    await expect(signIn.notice('User does not have access to this workspace')).toBeVisible();
    await page.goto('/objects/companies');
    await expect(page).toHaveURL(/\/welcome/);
  });

  test('signing out ends the session, including copies of it', async ({
    page,
    browser,
    newMember,
    password,
  }) => {
    const navigation = new Navigation(page);
    await new SignInPage(page).signIn(newMember.email, password);
    await expect(navigation.workspaceMenu).toBeVisible({ timeout: PAGE_LOAD });
    const session = await page.context().storageState();

    await navigation.signOut();

    await expect(page).toHaveURL(/\/welcome/);
    // A copy of the cookies and storage from before, the way every other UI test starts
    // signed in, no longer opens the app.
    await withCopyOf(browser, session, async (copy) => {
      await expect(copy).toHaveURL(/\/welcome/, { timeout: PAGE_LOAD });
      await expect(new SignInPage(copy).email).toBeVisible();
    });
  });
});

test.describe('password reset', () => {
  test('the reset email leads back into the app, and only the new password works', async ({
    page,
    newMember,
    mailbox,
    password,
  }) => {
    const signIn = new SignInPage(page);
    const navigation = new Navigation(page);
    const changed = newPassword();

    await signIn.forgotPassword(newMember.email);
    const email = await mailbox.waitForEmail({ subject: 'Reset Password' });
    await (
      await new PasswordResetPage(page).open(linkIn(email, '/reset-password/'))
    ).changePassword(changed);

    // Changing the password also signs the user in.
    await expect(navigation.workspaceMenu).toBeVisible({ timeout: PAGE_LOAD });
    await navigation.signOut();
    await signIn.signIn(newMember.email, password);
    await expect(signIn.notice('Wrong password.')).toBeVisible();
    await signIn.signIn(newMember.email, changed);
    await expect(navigation.workspaceMenu).toBeVisible({ timeout: PAGE_LOAD });
  });

  test('a reset link works only once', async ({ page, request, newMember, mailbox }) => {
    await requestPasswordReset(request, newMember.email);
    const link = linkIn(
      await mailbox.waitForEmail({ subject: 'Reset Password' }),
      '/reset-password/',
    );
    await resetPassword(request, new URL(link).pathname.split('/').at(-1) ?? '', newPassword());

    const reset = await new PasswordResetPage(page).open(link);

    // A used link sends the user to sign in instead of asking for a new password.
    await expect(page).toHaveURL(/\/welcome/, { timeout: PAGE_LOAD });
    await expect(reset.newPassword).toBeHidden();
  });
});
