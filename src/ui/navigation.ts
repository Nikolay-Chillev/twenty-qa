import type { Locator, Page } from '@playwright/test';

/** The left sidebar, with a link to each object's records. */
export class Navigation {
  constructor(private readonly page: Page) {}

  /** The sidebar link to an object's records, e.g. "Companies". */
  link(objectLabel: string): Locator {
    return this.page.getByRole('link', { name: objectLabel, exact: true });
  }

  async open(objectLabel: string): Promise<void> {
    await this.link(objectLabel).click();
  }
}
