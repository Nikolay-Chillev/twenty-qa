import { expect, type Locator, type Page } from '@playwright/test';

import { ViewBar } from './view-bar';

/** How long a page of the app may take to render after a navigation. */
export const PAGE_LOAD = 30_000;

/**
 * The table of an object's records. Twenty draws it with plain elements: no table, row
 * or cell roles. Rows are found by their `row-id-<id>` test id and a cell by the column
 * header above it, which keeps the tests independent of how the cells are nested.
 */
export class RecordTable {
  constructor(private readonly page: Page) {}

  row(id: string): Locator {
    return this.page.getByTestId(`row-id-${id}`);
  }

  /** Every row the table shows, in the page's order (not always the order on screen). */
  get rows(): Locator {
    return this.page.locator('[data-testid^="row-id-"]');
  }

  /**
   * The ids of the records the table shows, top to bottom as on screen. Since 2.50,
   * a sort moves the rows on screen without moving them in the page, so the page's
   * order is not the order a user reads.
   */
  async ids(): Promise<string[]> {
    // Read in one go in the page, so rows drawn again meanwhile cannot mix two renders.
    // The suite has no DOM types, hence the shape of the elements spelled out.
    const rows = await this.rows.evaluateAll(
      (
        elements: {
          getAttribute: (name: string) => string | null;
          getBoundingClientRect: () => { top: number };
        }[],
      ) =>
        elements.map((row) => ({
          testId: row.getAttribute('data-testid') ?? '',
          top: row.getBoundingClientRect().top,
        })),
    );
    return rows
      .sort((first, second) => first.top - second.top)
      .map((row) => row.testId.replace('row-id-', ''));
  }

  /** The link on a record's name, which opens its page. */
  link(name: string): Locator {
    return this.page.getByRole('link', { name, exact: true });
  }

  /**
   * Opens a record from the link on its name, as a user does: point at it, then click.
   * Pointing at a cell draws a copy of it on top, with the cell's controls, and the
   * click lands on that copy; a click aimed at the cell's own link would be refused
   * as covered.
   */
  async openRecord(name: string): Promise<void> {
    await this.link(name).first().hover();
    await expect(this.page.getByRole('group', { name: 'Cell controls' })).toBeVisible();
    // The copy comes after the cell's own link.
    await this.link(name).last().click();
  }

  columnHeader(column: string): Locator {
    return this.page.getByRole('button', { name: column, exact: true }).first();
  }

  /** The cell of a record in a column: the one right below the column's header. */
  async cell(id: string, column: string): Promise<Locator> {
    await expect(this.row(id)).toBeVisible();
    // Twenty draws only the columns in view, so bring the column in before measuring,
    // and measure again until its cells are drawn.
    await this.columnHeader(column).scrollIntoViewIfNeeded();
    let found: Locator | undefined;
    await expect(async () => {
      found = await this.cellUnder(id, column);
      expect(found, `a cell of record ${id} under column "${column}"`).toBeDefined();
    }).toPass({ timeout: 10_000 });
    if (!found) throw new Error(`No cell of record ${id} under column "${column}"`);
    return found;
  }

  private async cellUnder(id: string, column: string): Promise<Locator | undefined> {
    const header = await this.columnHeader(column).boundingBox();
    if (!header) return undefined;
    const middle = header.x + header.width / 2;
    for (const cell of await this.row(id).locator(':scope > div').all()) {
      const box = await cell.boundingBox();
      if (box && box.x <= middle && middle < box.x + box.width) return cell;
    }
    return undefined;
  }

  /** Types a new value into a text cell and saves it with Enter, as a user does. */
  async edit(id: string, column: string, value: string): Promise<void> {
    await (await this.cell(id, column)).click();
    const field = this.page.locator(':focus');
    await expect(field).toBeEditable();
    await field.fill(value);
    // Enter saves what the field holds at that moment; under load the field can take
    // a moment to show what was typed.
    await expect(field).toHaveValue(value);
    await this.page.keyboard.press('Enter');
  }
}

export interface ObjectNames {
  /** `companies`, as in the URL /objects/companies */
  plural: string;
  /** `Company`, as on the "Create Company" button */
  label: string;
}

export const COMPANIES: ObjectNames = { plural: 'companies', label: 'Company' };
export const PEOPLE: ObjectNames = { plural: 'people', label: 'Person' };

/** The list of an object's records, e.g. /objects/companies. */
export class RecordIndexPage {
  readonly table: RecordTable;
  readonly views: ViewBar;

  constructor(
    readonly page: Page,
    private readonly object: ObjectNames,
  ) {
    this.table = new RecordTable(page);
    this.views = new ViewBar(page);
  }

  /**
   * Opens the table. With `nameContains`, only records whose name contains it are shown,
   * through Twenty's URL filter, so a test sees its own records among everyone else's.
   */
  async open(nameContains?: string): Promise<this> {
    return this.goto(
      nameContains ? `?filter[name][CONTAINS]=${encodeURIComponent(nameContains)}` : '',
    );
  }

  /** Opens the table on a saved view, e.g. the object's own view from `ViewsApi.index`. */
  async openView(viewId: string): Promise<this> {
    return this.goto(`?viewId=${viewId}`);
  }

  private async goto(query: string): Promise<this> {
    await this.page.goto(`/objects/${this.object.plural}${query}`);
    // The first render loads the front end and the records: a page load, not an assertion.
    await expect(this.page.getByRole('checkbox', { name: 'Select all rows' })).toBeVisible({
      timeout: PAGE_LOAD,
    });
    return this;
  }

  /** Adds a record with the Create button and its name field; returns the new record's id. */
  async create(name: string): Promise<string> {
    await this.page.getByRole('button', { name: `Create ${this.object.label}` }).click();
    await this.page.getByPlaceholder('Name').fill(name);
    await this.page.keyboard.press('Enter');
    // The new record opens in a side panel whose address carries its id.
    await expect(this.page).toHaveURL(/panel=/);
    const panel = new URL(this.page.url()).searchParams.get('panel') ?? '';
    const id = /\/object\/\w+\/([0-9a-f-]{36})/.exec(panel)?.[1];
    if (!id) throw new Error(`No record id in the side panel address: ${panel}`);
    return id;
  }
}
