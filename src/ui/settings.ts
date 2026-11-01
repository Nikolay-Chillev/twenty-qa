import type { Locator, Page } from '@playwright/test';

/**
 * Settings, at /settings/<section>. Its sidebar lists the sections the user's role may
 * open: everyone has their own (Profile, Accounts, …), admins also the workspace's.
 */
export class SettingsPage {
  constructor(readonly page: Page) {}

  /** A section's link in the sidebar, e.g. "Members". */
  section(name: string): Locator {
    return this.page.getByRole('link', { name, exact: true });
  }

  /** Opens a section by its address, e.g. `members` or `developers/apis/new`. */
  async open(path: string): Promise<void> {
    await this.page.goto(`/settings/${path}`);
  }
}
