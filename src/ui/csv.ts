import { readFileSync } from 'node:fs';

import { expect, type Locator, type Page } from '@playwright/test';

import { CommandMenu } from './command-menu';

// Import and export of records as CSV, from the command menu of an object's table: "Import
// <Plural>" and "Export View". Both run in the browser.

/** A file as the user picks it. */
export interface CsvFile {
  name: string;
  content: string | Buffer;
}

/** Opens the command menu unless it is already open, as it stays after an export. */
async function commandMenu(page: Page): Promise<CommandMenu> {
  const menu = new CommandMenu(page);
  if (!(await menu.input.isVisible())) await menu.open();
  return menu;
}

/** Exports the open table's view with "Export View"; returns the file's name and bytes. */
export async function exportView(page: Page): Promise<{ name: string; content: Buffer }> {
  const menu = await commandMenu(page);
  const download = page.waitForEvent('download');
  await menu.action('Export View').click();
  const file = await download;
  return { name: file.suggestedFilename(), content: readFileSync(await file.path()) };
}

/**
 * The import dialog: Upload File, Match Columns and Validate Data. A cell with an error is
 * highlighted, and its message shows when the pointer is over it.
 */
export class ImportDialog {
  readonly dialog: Locator;

  constructor(readonly page: Page) {
    this.dialog = page.getByRole('dialog');
  }

  /** Starts "Import <Plural>", e.g. "Import Companies", with a file; ends on Match Columns. */
  async start(plural: string, file: CsvFile): Promise<this> {
    const menu = await commandMenu(this.page);
    await menu.action(`Import ${plural}`).click();
    const chooser = this.page.waitForEvent('filechooser');
    await this.dialog.getByRole('button', { name: 'Select file' }).click();
    await (
      await chooser
    ).setFiles({
      name: file.name,
      mimeType: 'text/csv',
      buffer: typeof file.content === 'string' ? Buffer.from(file.content, 'utf8') : file.content,
    });
    await expect(this.nextStep).toBeVisible();
    return this;
  }

  get nextStep(): Locator {
    return this.dialog.getByRole('button', { name: 'Next Step' });
  }

  /**
   * The field a column of the file goes to, by the column's place in the file, from 0:
   * "Select column..." until one is chosen, or the field the dialog guessed.
   */
  columnField(index: number): Locator {
    return this.dialog
      .getByRole('button', { name: /^(?!Close import$|Restart Import$|Next Step$)/ })
      .nth(index);
  }

  /** Matches a column to a field, searched for and picked as "<Field> ·<Type>". */
  async match(index: number, search: string, option: string): Promise<void> {
    await this.columnField(index).click();
    await this.page.keyboard.type(search);
    await this.page.getByRole('button', { name: option, exact: true }).click();
    await expect(this.columnField(index)).toHaveText(option.replace(/ ·.*$/, ''));
  }

  /** Goes on to Validate Data. */
  async validate(): Promise<void> {
    await this.nextStep.click();
    await expect(this.dialog.getByRole('button', { name: 'Confirm' })).toBeVisible();
  }

  /** The rows Validate Data flags, as the text of their cells. */
  async rowsWithErrors(): Promise<string[]> {
    const onlyErrors = this.dialog.getByRole('switch', { name: 'Show only rows with errors' });
    await onlyErrors.click();
    await expect(onlyErrors).toBeChecked();
    const rows = await this.dialog.getByRole('row').allInnerTexts();
    await onlyErrors.click();
    await expect(onlyErrors).not.toBeChecked();
    // The first row is the header.
    return rows.slice(1).map((row) => row.replace(/\s+/g, ' ').trim());
  }

  /** The message of a flagged cell, shown while the pointer is over it. */
  async errorOf(cellText: string): Promise<string> {
    await this.dialog.getByRole('gridcell', { name: cellText, exact: true }).first().hover();
    const tooltip = this.page.getByRole('tooltip');
    await expect(tooltip).toBeVisible();
    return (await tooltip.textContent()) ?? '';
  }

  /**
   * Imports the rows. With rows still in error the app asks first ("Rows with errors will
   * be ignored when submitting"), and `withErrors` answers Submit.
   */
  async confirm({ withErrors = false } = {}): Promise<void> {
    await this.dialog.getByRole('button', { name: 'Confirm' }).click();
    if (withErrors) {
      await expect(
        this.page.getByText('Rows with errors will be ignored when submitting.'),
      ).toBeVisible();
      await this.page.getByText('Submit', { exact: true }).click();
    }
    await expect(this.dialog).toHaveCount(0);
  }
}

/** A CSV file's text from rows of cells, quoted where a cell needs it. */
export function csv(rows: string[][]): string {
  const cell = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  return rows.map((row) => row.map(cell).join(',')).join('\n') + '\n';
}

/** The rows of an exported file: its text without the byte order mark, split by line. */
export function exportedLines(content: Buffer): string[] {
  return content
    .toString('utf8')
    .replace(/^\uFEFF/, '')
    .trimEnd()
    .split('\n');
}
