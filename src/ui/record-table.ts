import { expect, type Locator, type Page } from '@playwright/test';

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

  /** The link on a record's name, which opens its page. */
  link(name: string): Locator {
    return this.page.getByRole('link', { name, exact: true });
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

  constructor(
    readonly page: Page,
    private readonly object: ObjectNames,
  ) {
    this.table = new RecordTable(page);
  }

  /**
   * Opens the table. With `nameContains`, only records whose name contains it are shown,
   * through Twenty's URL filter, so a test sees its own records among everyone else's.
   */
  async open(nameContains?: string): Promise<this> {
    const query = nameContains ? `?filter[name][CONTAINS]=${encodeURIComponent(nameContains)}` : '';
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
