import { expect, type Locator, type Page } from '@playwright/test';

import { PAGE_LOAD } from './record-table';

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

  /**
   * Opens a section by its address when the app may send the user elsewhere at once, e.g.
   * a section their role may not see. Since 2.57 the app can do so before the page has
   * loaded, which Playwright takes for an interrupted navigation, so this waits only for
   * the address to be taken.
   */
  async tryToOpen(path: string): Promise<void> {
    await this.page.goto(`/settings/${path}`, { waitUntil: 'commit' });
  }

  /**
   * On the profile, the menus of the devices with a session on the account, except this
   * one, which has none.
   */
  get otherDevices(): Locator {
    return this.page.getByRole('button', { name: 'More options' });
  }

  /** Logs out every other device from the profile's list of devices, one by one. */
  async logOutOtherDevices(): Promise<void> {
    await this.open('profile');
    await expect(this.page.getByRole('heading', { name: 'Devices' })).toBeVisible({
      timeout: PAGE_LOAD,
    });
    await expect(this.otherDevices.first()).toBeVisible();
    for (let left = await this.otherDevices.count(); left > 0; left--) {
      await this.otherDevices.first().click();
      await this.page.getByRole('menuitem', { name: 'Log out' }).click();
      await expect(this.otherDevices).toHaveCount(left - 1);
    }
  }
}
