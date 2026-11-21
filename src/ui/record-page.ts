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

  /**
   * A link to a related record, e.g. a person's company, in the record's relations
   * below its fields: the last link of that name. The field showing the same link is
   * passed over, as pointing at a field draws a copy of it on top that takes the click
   * (see `RecordTable.openRecord`).
   */
  relation(name: string): Locator {
    return this.page.getByRole('link', { name, exact: true }).last();
  }

  /**
   * A tab above the timeline, e.g. "Notes". Its address is the record's with a hash; the
   * sidebar has links of the same names to the objects' own lists.
   */
  tab(name: string): Locator {
    return this.page.getByRole('link', { name, exact: true }).and(this.page.locator('[href*="#"]'));
  }

  /** Starts a note from the Notes tab. The note opens in the side panel; returns its id. */
  async newNote(): Promise<string> {
    await this.tab('Notes').click();
    await this.page.getByRole('button', { name: 'New note' }).click();
    await expect(this.page).toHaveURL(/panel=/);
    const panel = new URL(this.page.url()).searchParams.get('panel') ?? '';
    const id = /\/object\/note\/([0-9a-f-]{36})/.exec(panel)?.[1];
    if (!id) throw new Error(`No note id in the side panel address: ${panel}`);
    return id;
  }

  /** A task on the Tasks tab: its title, with the checkbox that marks it done. */
  task(title: string): Locator {
    const name = this.page.getByRole('button', { name: title, exact: true });
    return this.page
      .locator('div')
      .filter({ has: name })
      .filter({ has: this.page.getByRole('checkbox') })
      .last();
  }
}
