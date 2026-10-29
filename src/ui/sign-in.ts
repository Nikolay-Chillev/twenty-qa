import { expect, type Locator, type Page, test } from '@playwright/test';

import { PAGE_LOAD } from './record-table';

const STUCK_ON_LOADER = 'https://github.com/Nikolay-Chillev/twenty-qa/issues/57';

/** Longer than the form took to show in any load that worked, with a margin for CI. */
const FORM_SHOWN_WITHIN = 20_000;

/**
 * Waits for the sign-in form. Now and then Twenty leaves the page on its loader for
 * good (finding #57); a reload shows the form. So the page is reloaded once, and the
 * test is annotated with the finding, which keeps count of how often it happens.
 */
async function waitForForm(page: Page, field: Locator): Promise<void> {
  const shown = await field.waitFor({ timeout: FORM_SHOWN_WITHIN }).then(
    () => true,
    () => false,
  );
  if (shown) return;
  test.info().annotations.push({
    type: 'issue',
    description: `${STUCK_ON_LOADER} (the page stayed on its loader and was reloaded)`,
  });
  await page.reload();
  await expect(field).toBeVisible({ timeout: PAGE_LOAD });
}

/**
 * The workspace's welcome page, at its own address: one form that asks for the email
 * first, then for a password to sign in, or to sign up when the email has no account.
 */
export class SignInPage {
  readonly email: Locator;
  readonly password: Locator;
  readonly signInButton: Locator;
  readonly signUpButton: Locator;

  /** `home` is where the page lives, relative to the test's base URL or absolute. */
  constructor(
    readonly page: Page,
    private readonly home = '/',
  ) {
    this.email = page.getByRole('textbox', { name: 'Email', exact: true });
    this.password = page.getByRole('textbox', { name: 'Password', exact: true });
    this.signInButton = page.getByRole('button', { name: 'Sign in', exact: true });
    this.signUpButton = page.getByRole('button', { name: 'Sign up', exact: true });
  }

  /** A message the app shows in its notifications, e.g. "Wrong password." */
  notice(text: string): Locator {
    return this.page.getByRole('status').filter({ hasText: text });
  }

  async open(): Promise<this> {
    await this.page.goto(this.home);
    await waitForForm(this.page, this.email);
    return this;
  }

  async enterEmail(email: string): Promise<void> {
    await this.email.fill(email);
    await this.page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(this.password).toBeVisible();
  }

  async signIn(email: string, password: string): Promise<void> {
    await this.open();
    await this.enterEmail(email);
    await this.password.fill(password);
    await this.signInButton.click();
  }

  /** Asks for the reset email from the password step, as a user who forgot it does. */
  async forgotPassword(email: string): Promise<void> {
    await this.open();
    await this.enterEmail(email);
    await this.page.getByRole('button', { name: 'Forgot your password?' }).click();
    // The same answer whether or not the address has an account.
    await expect(
      this.notice('If this email is registered, a password reset link has been sent'),
    ).toBeVisible();
  }
}

/**
 * The page an invitation link opens: the welcome page's form under "Join <workspace>
 * team", with the invited address filled in. Signing up leads on to the profile form.
 */
export class InvitationPage {
  readonly form: SignInPage;
  readonly firstName: Locator;

  constructor(readonly page: Page) {
    this.form = new SignInPage(page);
    this.firstName = page.getByRole('textbox', { name: 'First Name' });
  }

  heading(workspace: string): Locator {
    return this.page.getByText(`Join ${workspace} team`, { exact: true });
  }

  async open(link: string): Promise<this> {
    await this.page.goto(link);
    await waitForForm(this.page, this.form.email);
    await expect(this.form.email).toHaveValue(/@/);
    return this;
  }

  /** Signs up with the invited address and a password. */
  async signUp(password: string): Promise<void> {
    await this.page.getByRole('button', { name: 'Continue', exact: true }).click();
    await this.form.password.fill(password);
    await this.form.signUpButton.click();
  }

  /**
   * Tries a link that may no longer be valid, as its invitee would: signs up if the page
   * offers the form for the invited address, then waits for the app's answer, a notice
   * or the profile form. A link refused outright, with a notice or by sending the user
   * to the sign-in page, ends at the first step.
   */
  async tryToJoin(link: string, password: string): Promise<void> {
    await this.page.goto(link);
    const answer = this.page.getByRole('status').or(this.firstName).first();
    const offered = async () => (await this.form.email.inputValue().catch(() => '')).includes('@');
    await expect
      .poll(
        async () =>
          (await offered()) || (await answer.isVisible()) || this.page.url().includes('/welcome'),
        { message: 'the invitation form or a refusal', timeout: PAGE_LOAD },
      )
      .toBe(true);
    if ((await offered()) && !(await answer.isVisible())) {
      await this.signUp(password);
      await expect(answer).toBeVisible({ timeout: PAGE_LOAD });
    }
  }

  /** Signs up, then fills in the name Twenty asks a new member for. */
  async join(password: string, name: { firstName: string; lastName: string }): Promise<void> {
    await this.signUp(password);
    await expect(this.firstName).toBeVisible({ timeout: PAGE_LOAD });
    await this.firstName.fill(name.firstName);
    await this.page.getByRole('textbox', { name: 'Last name' }).fill(name.lastName);
    await this.page.getByRole('button', { name: 'Continue', exact: true }).click();
  }
}

/** The page a password reset link opens: the account's email and a new password. */
export class PasswordResetPage {
  readonly email: Locator;
  readonly newPassword: Locator;

  constructor(readonly page: Page) {
    this.email = page.getByRole('textbox', { name: 'Email', exact: true });
    this.newPassword = page.getByRole('textbox', { name: 'New Password', exact: true });
  }

  async open(link: string): Promise<this> {
    await this.page.goto(link);
    return this;
  }

  /** Sets the new password; the form takes it once the link checked out and showed the email. */
  async changePassword(password: string): Promise<void> {
    await expect(this.email).toHaveValue(/@/, { timeout: PAGE_LOAD });
    await this.newPassword.fill(password);
    await this.page.getByRole('button', { name: 'Change Password' }).click();
    await expect(this.page).not.toHaveURL(/\/reset-password\//);
  }
}
