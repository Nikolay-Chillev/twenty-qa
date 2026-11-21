import { FilesApi } from '../../src/api/files';
import { memberIdOf } from '../../src/auth/workspace';
import { companyInput } from '../../src/data/factories';
import { expect, test } from '../../src/fixtures';
import { RecordPage } from '../../src/ui/record-page';
import { PAGE_LOAD, RecordIndexPage } from '../../src/ui/record-table';

const TASKS = { plural: 'tasks', label: 'Task' };

test.describe('notes, tasks and files on a record', () => {
  test('a note written on a company keeps its heading, list, link and Cyrillic', async ({
    page,
    api,
  }) => {
    const company = await api.companies.create(companyInput());
    const record = await new RecordPage(page).open('company', company.id);
    const noteId = await record.newNote();
    const panel = page.getByRole('complementary');

    await panel.getByRole('textbox', { name: 'Title' }).fill('Среща с клиента');
    // The editor turns "# " into a heading and "- " into a list, and a typed address
    // into a link, as a user types them.
    await panel.locator('.ProseMirror').click();
    await page.keyboard.type('# Договор');
    await page.keyboard.press('Enter');
    await page.keyboard.type('- цена');
    await page.keyboard.press('Enter');
    await page.keyboard.type('срок');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Виж https://example.com/dogovor ');

    await expect
      .poll(async () => (await api.notes.get(noteId)).bodyV2.markdown?.trim())
      .toBe(
        '# Договор\n\n- цена\n- срок\n\nВиж [https://example.com/dogovor](https://example.com/dogovor)',
      );
    expect((await api.notes.get(noteId)).title).toBe('Среща с клиента');
    // The address keeps the note open in the side panel, so a reload opens it afresh.
    await page.reload();
    const editor = page.getByRole('complementary').locator('.ProseMirror');
    await expect(editor.getByRole('heading', { name: 'Договор' })).toBeVisible({
      timeout: PAGE_LOAD,
    });
    await expect(editor.getByRole('listitem')).toHaveText(['цена', 'срок']);
    await expect(editor.getByRole('link', { name: 'https://example.com/dogovor' })).toHaveAttribute(
      'href',
      'https://example.com/dogovor',
    );
  });

  test("a task with a due date and an assignee is on the company and on the assignee's list", async ({
    page,
    request,
    api,
    adminToken,
    views,
  }) => {
    const company = await api.companies.create(companyInput());
    const task = await api.tasks.create({
      title: 'Обади се за договора',
      dueAt: '2026-12-15T09:00:00.000Z',
      assigneeId: await memberIdOf(request, adminToken),
    });
    await api.taskTargets.create({ taskId: task.id, targetCompanyId: company.id });

    const record = await new RecordPage(page).open('company', company.id);
    await record.tab('Tasks').click();
    await expect(record.task('Обади се за договора')).toContainText('Dec 15, 2026');
    // The admin, who is the assignee, finds it in their own view of the tasks.
    const mine = (await views.list('task')).find((view) => view.name === 'Assigned to Me');
    const tasks = await new RecordIndexPage(page, TASKS).openView(mine?.id ?? '');
    await expect(tasks.table.row(task.id)).toBeVisible();
  });

  test('a task ticked done on the company stays done', async ({ page, api }) => {
    const company = await api.companies.create(companyInput());
    const task = await api.tasks.create({ title: 'Изпрати оферта' });
    await api.taskTargets.create({ taskId: task.id, targetCompanyId: company.id });
    const record = await new RecordPage(page).open('company', company.id);
    await record.tab('Tasks').click();

    await record.task('Изпрати оферта').getByRole('checkbox').click();

    await expect.poll(async () => (await api.tasks.get(task.id)).status).toBe('DONE');
    await page.reload();
    await record.tab('Tasks').click();
    await expect(record.task('Изпрати оферта').getByRole('checkbox')).toBeChecked({
      timeout: PAGE_LOAD,
    });
  });

  test('a file added on a company is listed, and downloads unchanged', async ({
    page,
    request,
    api,
  }) => {
    const company = await api.companies.create(companyInput());
    const content = Buffer.from('Оферта за 2027 г.\n', 'utf8');
    const record = await new RecordPage(page).open('company', company.id);
    await record.tab('Files').click();

    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Add file' }).click();
    await (await chooser).setFiles({ name: 'оферта.txt', mimeType: 'text/plain', buffer: content });

    await expect(page.getByRole('link', { name: 'оферта.txt' })).toBeVisible();
    const files = await api.attachments.list({ filter: `targetCompanyId[eq]:"${company.id}"` });
    const download = await request.get(files.records[0]?.file[0]?.url ?? '');
    expect(await download.body()).toEqual(content);
  });

  test('markup in a note, a task title and a file name is shown as text, and never runs', async ({
    page,
    request,
    api,
    adminToken,
  }) => {
    const markup = '<img src=x onerror="window.ranMarkup = true">';
    const dialogs: string[] = [];
    page.on('dialog', (dialog) => {
      dialogs.push(dialog.message());
      void dialog.dismiss();
    });
    const company = await api.companies.create(companyInput());
    const note = await api.notes.create({
      title: `Бележка ${markup}`,
      bodyV2: {
        markdown: `Текст ${markup}\n\n<script>window.ranMarkup = true</script>\n\n[натисни](javascript:window.ranMarkup=true)`,
      },
    });
    await api.noteTargets.create({ noteId: note.id, targetCompanyId: company.id });
    const task = await api.tasks.create({ title: `Задача ${markup}` });
    await api.taskTargets.create({ taskId: task.id, targetCompanyId: company.id });
    const stored = await new FilesApi(request, adminToken).upload(
      `${markup}.txt`,
      Buffer.from('x'),
    );
    await api.attachments.create({
      name: `${markup}.txt`,
      targetCompanyId: company.id,
      file: [{ fileId: stored.id, label: `${markup}.txt` }],
    });

    const record = await new RecordPage(page).open('company', company.id);
    for (const [tab, text] of [
      ['Notes', `Бележка ${markup}`],
      ['Tasks', `Задача ${markup}`],
      ['Files', `${markup}.txt`],
    ] as const) {
      await record.tab(tab).click();
      await expect(page.getByText(text, { exact: true }).first(), tab).toBeVisible();
    }
    await record.tab('Notes').click();
    await page.getByText(`Бележка ${markup}`, { exact: true }).first().click();
    const editor = page.getByRole('complementary').locator('.ProseMirror');
    await expect(editor).toContainText(`Текст ${markup}`);
    await expect(editor).toContainText('<script>window.ranMarkup = true</script>');

    await expect(page.locator('img[src="x"]')).toHaveCount(0);
    await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
    // The suite has no DOM types, so the page is asked with an expression.
    expect(await page.evaluate('"ranMarkup" in window')).toBe(false);
    expect(dialogs).toEqual([]);
  });
});
