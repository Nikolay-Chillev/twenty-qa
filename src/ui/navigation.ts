import { expect, type Locator, type Page } from '@playwright/test';

import { WORKSPACE_NAME } from '../auth/users';

/** The left sidebar, with a link to each object's records. */
export class Navigation {
  constructor(private readonly page: Page) {}

  /** The workspace's menu at the top of the sidebar, there once the app opens for a user. */
  get workspaceMenu(): Locator {
    return this.page.getByRole('button', { name: WORKSPACE_NAME });
  }

  /** The sidebar link to an object's records, e.g. "Companies". */
  link(objectLabel: string): Locator {
    return this.page.getByRole('link', { name: objectLabel, exact: true });
  }

  async open(objectLabel: string): Promise<void> {
    await this.link(objectLabel).click();
  }

  /** Signs out with Logout in the settings' sidebar, the only place the app offers it. */
  async signOut(): Promise<void> {
    await this.page.getByRole('button', { name: 'Settings' }).click();
    await this.page.getByRole('button', { name: 'Logout' }).click();
    // The app moves to its welcome page on its own; a navigation started before that
    // would be cut short by it.
    await expect(this.page).toHaveURL(/\/welcome/);
  }
}
