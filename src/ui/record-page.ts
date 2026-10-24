import { expect, type Locator, type Page } from '@playwright/test';

import { PAGE_LOAD } from './record-table';

/** One record's page, e.g. /object/company/<id>: its fields, relations and timeline. */
export class RecordPage {
  readonly heading: Locator;

  constructor(readonly page: Page) {
    this.heading = page.getByRole('heading', { level: 3 }).first();
  }

  async open(objectSingular: string, id: string): Promise<this> {
    await this.page.goto(`/object/${objectSingular}/${id}`);
    await expect(this.heading).toBeVisible({ timeout: PAGE_LOAD });
    return this;
  }

  /** A link to a related record, e.g. a person's company. */
  relation(name: string): Locator {
    return this.page.getByRole('link', { name, exact: true }).first();
  }
}
