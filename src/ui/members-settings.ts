import { expect, type Locator, type Page } from '@playwright/test';

import { PAGE_LOAD } from './record-table';

/**
 * The invitations part of Settings → Members: "Invite by email" with the list of
 * pending invitations under it, and "Invite by link" above it.
 */
export class MembersSettingsPage {
  readonly emails: Locator;

  constructor(readonly page: Page) {
    // The field has no label; its placeholder names it.
    this.emails = page.getByRole('textbox', { name: 'tim@apple.com, jony.ive@apple.dev' });
  }

  async open(): Promise<this> {
    await this.page.goto('/settings/members#invite');
    await expect(this.emails).toBeVisible({ timeout: PAGE_LOAD });
    return this;
  }

  /** Sends invitations to one or more addresses, separated by commas, with the default role. */
  async invite(emails: string): Promise<void> {
    await this.emails.fill(emails);
    await this.page.getByRole('button', { name: 'Invite', exact: true }).click();
    await expect(
      this.page.getByRole('status').filter({ hasText: /invitations? sent/ }),
    ).toBeVisible();
  }

  /**
   * A pending invitation in the list: its address, role, expiry and buttons. The expiry
   * is told in words ("30 days", "about 1 month") that depend on the time zone.
   */
  pending(email: string): Locator {
    // The rows have no table roles, only a data attribute.
    return this.page.locator('[data-table-row]').filter({ hasText: email });
  }

  async resend(email: string): Promise<void> {
    await this.pending(email).getByRole('button', { name: 'Resend invitation' }).click();
  }

  /** Removes an invitation from the list; Twenty asks for no confirmation. */
  async remove(email: string): Promise<void> {
    await this.pending(email).getByRole('button', { name: 'Remove invitation' }).click();
    await expect(this.page.getByText(email, { exact: true })).toHaveCount(0);
  }
}
