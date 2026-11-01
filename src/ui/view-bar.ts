import { expect, type Locator, type Page } from '@playwright/test';

const viewIdOf = (url: string): string | null => new URL(url).searchParams.get('viewId');

/**
 * The bar above a record table: the list of views on the left, Filter and Sort on the
 * right, and below them a chip for each filter in use with the buttons that save it.
 */
export class ViewBar {
  /** Opens the list of views; it shows the open view and its count, e.g. "All Companies · 2,152". */
  readonly picker: Locator;

  constructor(private readonly page: Page) {
    this.picker = page.getByRole('button', { name: / · [\d,]+$/ });
  }

  /** The chip of a filter in use, e.g. "Name : Софт". */
  chip(field: string, value: string): Locator {
    return this.page.getByRole('button', { name: `${field} : ${value}`, exact: true });
  }

  /** Opens the Filter menu and returns its list of the fields a filter may be on. */
  async openFilterFields(): Promise<Locator> {
    await this.page.getByRole('button', { name: 'Filter' }).first().click();
    const fields = this.page
      .getByRole('listbox')
      .filter({ has: this.page.getByRole('textbox', { name: 'Search fields' }) });
    await expect(fields).toBeVisible();
    return fields;
  }

  /** Shows only the records whose field contains the value, as typed in the filter menu. */
  async filter(field: string, value: string): Promise<void> {
    const fields = await this.openFilterFields();
    await fields.getByRole('button', { name: field, exact: true }).click();
    await this.page.locator(':focus').fill(value);
    await this.page.keyboard.press('Escape');
    await expect(this.chip(field, value)).toBeVisible();
  }

  /** Changes the value of a filter in use through its chip. */
  async changeFilter(field: string, from: string, to: string): Promise<void> {
    await this.chip(field, from).click();
    await this.page.getByRole('textbox', { name: field }).fill(to);
    await this.page.keyboard.press('Escape');
    await expect(this.chip(field, to)).toBeVisible();
  }

  async sort(field: string, direction: 'Ascending' | 'Descending'): Promise<void> {
    await this.page.getByRole('button', { name: 'Sort' }).click();
    const sort = this.page.getByRole('dialog', { name: 'Sort' });
    // The direction is chosen first; the menu starts at Ascending.
    if (direction === 'Descending') {
      const directions = this.page.getByRole('dialog', { name: 'Direction' });
      await sort.getByRole('button', { name: 'Ascending' }).click();
      await directions.getByRole('option', { name: 'Descending' }).click();
      // A field clicked while the direction menu is still closing is lost.
      await expect(directions).toBeHidden();
      await expect(sort.getByRole('button', { name: 'Descending' })).toBeVisible();
    }
    await sort.getByRole('button', { name: field, exact: true }).click();
    // Choosing the field applies the sort and closes the menu.
    await expect(sort).toBeHidden();
  }

  /**
   * Saves the filters and sorts in use as a new view, from the object's own view (other
   * views offer "Update view" instead). Returns the new view's id.
   */
  async saveAsNewView(name: string): Promise<string> {
    const from = viewIdOf(this.page.url());
    await this.page.getByRole('button', { name: 'Save as new view' }).click();
    await this.page.locator(':focus').fill(name);
    await this.page.getByRole('button', { name: 'Create new view' }).click();
    // The table switches to the new view, whose id the address then carries.
    await expect(this.picker).toContainText(name);
    await expect.poll(() => viewIdOf(this.page.url())).not.toBe(from);
    const id = viewIdOf(this.page.url());
    if (!id) throw new Error(`No view id in the address: ${this.page.url()}`);
    return id;
  }

  /** Saves the changed filters and sorts into the open view. */
  async updateView(): Promise<void> {
    const update = this.page.getByRole('button', { name: 'Update view' });
    await update.click();
    // Once saved, the view has no unsaved changes left to update.
    await expect(update).toBeHidden();
  }

  /** A view in the open list of views. */
  listed(name: string): Locator {
    return this.page.getByRole('listbox').getByRole('button', { name, exact: true });
  }

  async openList(): Promise<void> {
    await this.picker.click();
    await expect(this.page.getByRole('listbox').first()).toBeVisible();
  }

  async switchTo(name: string): Promise<void> {
    await this.openList();
    await this.listed(name).click();
    await expect(this.picker).toContainText(name);
  }

  async rename(name: string, newName: string): Promise<void> {
    const menu = await this.openMenu(name);
    await menu.getByRole('menuitem', { name: 'Edit' }).click();
    await this.page.locator(':focus').fill(newName);
    await this.page.keyboard.press('Enter');
    await expect(this.picker).toContainText(newName);
    await this.page.keyboard.press('Escape');
  }

  /** Deletes a view from its menu in the list of views. Twenty asks for no confirmation. */
  async delete(name: string): Promise<void> {
    const menu = await this.openMenu(name);
    await menu.getByRole('menuitem', { name: 'Delete' }).click();
  }

  /**
   * Opens the menu of a view in the list, e.g. with Edit and Delete; its button shows
   * only while the view is hovered.
   */
  async openMenu(name: string): Promise<Locator> {
    await this.openList();
    const item = this.page
      .getByRole('listbox')
      .getByRole('button', { name: `${name} More options`, exact: true });
    await item.hover();
    await item.getByRole('button', { name: 'More options' }).click();
    return this.page.getByRole('menu', { name: 'More options' });
  }
}
