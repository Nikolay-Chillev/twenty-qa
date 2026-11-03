import { expect, type Locator, type Page } from '@playwright/test';

import { PAGE_LOAD } from './record-table';
import { ViewBar } from './view-bar';

/**
 * A board view of an object's records, e.g. the opportunities "By Stage": a column for
 * each value of a select field, and a card for each record. Like the table, it has no
 * list or grid roles: a card is found by its record id, and its column by where it sits
 * under the column headers.
 */
export class RecordBoard {
  readonly views: ViewBar;

  /**
   * `plural` is the object as in its URL, e.g. `opportunities`; `columns` are the labels
   * of the columns, left to right, e.g. "New".
   */
  constructor(
    readonly page: Page,
    private readonly plural: string,
    private readonly columns: readonly string[],
  ) {
    this.views = new ViewBar(page);
  }

  /** Opens a board view; with `nameContains`, only the records whose name contains it. */
  async open(viewId: string, nameContains?: string): Promise<this> {
    const filter = nameContains
      ? `&filter[name][CONTAINS]=${encodeURIComponent(nameContains)}`
      : '';
    await this.page.goto(`/objects/${this.plural}?viewId=${viewId}${filter}`);
    await expect(this.views.picker).toBeVisible({ timeout: PAGE_LOAD });
    for (const column of this.columns) await expect(this.header(column)).toBeVisible();
    return this;
  }

  /** A column's header: its label, the total of the column, and its menus. */
  header(column: string): Locator {
    return this.page.getByRole('button', { name: new RegExp(`^${column} `) }).first();
  }

  /** The total a column's header shows, e.g. "12.5k". */
  async total(column: string): Promise<string> {
    const name = (await this.header(column).textContent()) ?? '';
    return name.slice(column.length).trim();
  }

  card(id: string): Locator {
    return this.page.locator(`[data-selectable-id="${id}"]`);
  }

  /** What picks a card up for a drag; a card that cannot be moved has none. */
  handle(id: string): Locator {
    const card = `[data-selectable-id="${id}"]`;
    return this.page.locator(
      [
        `[aria-roledescription="draggable"]:has(${card})`,
        `${card} [aria-roledescription="draggable"]`,
        `${card}[aria-roledescription="draggable"]`,
      ].join(', '),
    );
  }

  /** The column a card is in: the one whose header is above the card's middle. */
  async columnOf(id: string): Promise<string | undefined> {
    const middle = centre(await boxOf(this.card(id))).x;
    for (const column of this.columns) {
      const header = await boxOf(this.header(column));
      if (header.x <= middle && middle < header.x + header.width) return column;
    }
    return undefined;
  }

  /** The record ids of the cards in a column, top to bottom. */
  async idsIn(column: string): Promise<string[]> {
    const header = await boxOf(this.header(column));
    const cards: { id: string; top: number }[] = [];
    for (const card of await this.page.locator('[data-selectable-id]').all()) {
      const box = await card.boundingBox();
      const id = await card.getAttribute('data-selectable-id');
      if (box && id && header.x <= centre(box).x && centre(box).x < header.x + header.width) {
        cards.push({ id, top: box.y });
      }
    }
    return cards.sort((first, second) => first.top - second.top).map((card) => card.id);
  }

  /**
   * Drags a card with the mouse, as a user does: into another column, below its header,
   * or onto the top half of another card, which puts it before that card.
   */
  async drag(id: string, to: { column: string } | { before: string }): Promise<void> {
    const from = centre(await boxOf(this.card(id)));
    let target: { x: number; y: number };
    if ('column' in to) {
      const header = await boxOf(this.header(to.column));
      target = { x: centre(header).x, y: header.y + header.height + 40 };
    } else {
      const card = await boxOf(this.card(to.before));
      target = { x: centre(card).x, y: card.y + card.height / 4 };
    }
    await this.page.mouse.move(from.x, from.y);
    await this.page.mouse.down();
    // The board starts a drag only after the pointer has moved a little.
    await this.page.mouse.move(from.x + 10, from.y + 10, { steps: 5 });
    await this.page.mouse.move(target.x, target.y, { steps: 20 });
    // The board picks the drop target on a pointer move; in WebKit the last move of a
    // fast drag can still be measured against the column it left, so move once more.
    await this.page.mouse.move(target.x + 2, target.y + 2, { steps: 3 });
    await this.page.mouse.up();
  }

  /**
   * Adds a record with the "+ New" at the bottom of a column; the record opens in the
   * side panel, where its name is typed. Returns the new record's id.
   */
  async add(column: string, name: string): Promise<string> {
    const header = await boxOf(this.header(column));
    const buttons = this.page.getByRole('button', { name: 'New', exact: true });
    let added = false;
    for (const button of await buttons.all()) {
      const box = await button.boundingBox();
      if (box && header.x <= centre(box).x && centre(box).x < header.x + header.width) {
        if (box.y > header.y + header.height) {
          await button.click();
          added = true;
          break;
        }
      }
    }
    if (!added) throw new Error(`No "New" button under column ${column}`);
    // The name starts with the text of the name filter in use, if any.
    const nameField = this.page.getByRole('textbox', { name: 'Name' });
    await nameField.fill(name);
    await this.page.keyboard.press('Enter');
    await expect(this.page).toHaveURL(/panel=/);
    const panel = new URL(this.page.url()).searchParams.get('panel') ?? '';
    const id = /\/object\/\w+\/([0-9a-f-]{36})/.exec(panel)?.[1];
    if (!id) throw new Error(`No record id in the side panel address: ${panel}`);
    return id;
  }
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const centre = (box: Box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

async function boxOf(locator: Locator): Promise<Box> {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  if (!box) throw new Error(`${locator.toString()} has no size`);
  return box;
}
