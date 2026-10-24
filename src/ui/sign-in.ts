import { expect, type Locator, type Page } from '@playwright/test';

import { PAGE_LOAD } from './record-table';

/**
 * The workspace's welcome page, at its own address: one form that asks for the email
 * first, then for a password to sign in, or to sign up when the email has no account.
 */
export class SignInPage {
  readonly email: Locator;
  readonly password: Locator;
  readonly signInButton: Locator;
  readonly signUpButton: Locator;

  constructor(readonly page: Page) {
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
    await this.page.goto('/');
    await expect(this.email).toBeVisible({ timeout: PAGE_LOAD });
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
