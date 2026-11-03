import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The command menu in the side panel, opened with the "Command Menu" button at the top
 * right or with Ctrl+K (Cmd+K on a Mac): what can be done with the selected records, the
 * object and the workspace, and search. It lists only the actions the user's role
 * allows, e.g. "Delete Company".
 */
export class CommandMenu {
  readonly input: Locator;

  constructor(private readonly page: Page) {
    this.input = page.getByPlaceholder('Type anything...');
  }

  async open(): Promise<void> {
    await this.page.getByRole('button', { name: 'Command Menu' }).click();
    await expect(this.input).toBeVisible();
  }

  /**
   * Opens the menu with the keyboard. The app takes Cmd+K where the browser says it runs
   * on a Mac, as WebKit's Safari profile does, and Ctrl+K elsewhere, so it tries both.
   */
  async openWithKeyboard(): Promise<void> {
    for (const shortcut of ['Control+k', 'Meta+k']) {
      await this.page.keyboard.press(shortcut);
      const opened = await this.input.waitFor({ timeout: 3_000 }).then(
        () => true,
        () => false,
      );
      if (opened) return;
    }
    await expect(this.input, 'the command menu opens with Ctrl+K or Cmd+K').toBeVisible();
  }

  /** An action of the open menu, e.g. "Delete Company". */
  action(name: string): Locator {
    return this.page.getByRole('button', { name, exact: true });
  }

  /** Searches records for the text typed in the open menu, with its "Search" action. */
  async search(text: string): Promise<void> {
    await this.input.fill(text);
    await this.action('Search /').click();
    await expect(this.page.getByText('Results', { exact: true })).toBeVisible();
  }

  /** A record in the search results, by its name and the label of its object. */
  result(name: string, object: string): Locator {
    return this.page.getByRole('button', { name: `${name} ·${object}`, exact: true });
  }
}
