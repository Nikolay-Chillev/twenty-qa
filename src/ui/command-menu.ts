import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The command menu in the side panel, opened with the "Command Menu" button at the top
 * right: what can be done with the selected records, the object and the workspace. It
 * lists only the actions the user's role allows, e.g. "Delete Company".
 */
export class CommandMenu {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.getByRole('button', { name: 'Command Menu' }).click();
    await expect(this.page.getByPlaceholder('Type anything...')).toBeVisible();
  }

  /** An action of the open menu, e.g. "Delete Company". */
  action(name: string): Locator {
    return this.page.getByRole('button', { name, exact: true });
  }
}
