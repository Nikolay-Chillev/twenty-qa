import { FilesApi } from '../../../src/api/files';
import { GraphQLError } from '../../../src/api/graphql';
import { expectDenied } from '../../../src/api/refusals';
import type { ObjectRights } from '../../../src/auth/roles';
import { memberIdOf } from '../../../src/auth/workspace';
import { companyInput, personInput } from '../../../src/data/factories';
import { type Api, apiFor, expect, test } from '../../../src/fixtures';
import type { Company } from '../../../src/schemas/records';

const NO_ACCESS: ObjectRights = {
  canReadObjectRecords: false,
  canUpdateObjectRecords: false,
  canSoftDeleteObjectRecords: false,
  canDestroyObjectRecords: false,
};

/** The node types of the editor's document, e.g. `heading` and `bulletList`. */
function nodeTypes(document: string | null): string[] {
  const types: string[] = [];
  const visit = (node: { type?: string; content?: unknown[]; marks?: { type: string }[] }) => {
    if (node.type) types.push(node.type);
    for (const mark of node.marks ?? []) types.push(mark.type);
    for (const child of node.content ?? []) visit(child as typeof node);
  };
  visit(JSON.parse(document ?? '{}') as Parameters<typeof visit>[0]);
  return types;
}

/** Attaches a file to a company, as the Files tab of its page does. */
async function attach(api: Api, files: FilesApi, company: Company, name: string, content: Buffer) {
  const stored = await files.upload(name, content);
  return api.attachments.create({
    name,
    targetCompanyId: company.id,
    file: [{ fileId: stored.id, label: name }],
  });
}

test.describe('notes and tasks', () => {
  test('a note keeps its headings, lists, links and Cyrillic, as Markdown and as rich text', async ({
    api,
  }) => {
    const markdown =
      '# Среща с клиента\n\n- цена\n- срок\n\n[Договор](https://example.com/dogovor)';

    const note = await api.notes.create({ title: 'Бележка от срещата', bodyV2: { markdown } });

    const read = await api.notes.get(note.id);
    expect(read.title).toBe('Бележка от срещата');
    expect(read.bodyV2.markdown).toBe(markdown);
    expect(nodeTypes(read.bodyV2.tiptap)).toEqual(
      expect.arrayContaining(['heading', 'bulletList', 'listItem', 'link']),
    );
  });

  test('a note on a company and a person is listed for each', async ({ api }) => {
    const company = await api.companies.create(companyInput());
    const person = await api.people.create(personInput({ companyId: company.id }));
    const note = await api.notes.create({ title: 'Обща бележка' });

    await api.noteTargets.create({ noteId: note.id, targetCompanyId: company.id });
    await api.noteTargets.create({ noteId: note.id, targetPersonId: person.id });

    for (const filter of [
      `targetCompanyId[eq]:"${company.id}"`,
      `targetPersonId[eq]:"${person.id}"`,
    ]) {
      const { records } = await api.noteTargets.list({ filter });
      expect(
        records.map((target) => target.noteId),
        filter,
      ).toEqual([note.id]);
    }
  });

  test("a task with a due date and an assignee is on the record and on the assignee's list", async ({
    request,
    api,
    adminToken,
  }) => {
    const company = await api.companies.create(companyInput());
    const assigneeId = await memberIdOf(request, adminToken);
    const dueAt = '2026-12-15T09:00:00.000Z';

    const task = await api.tasks.create({ title: 'Обади се за договора', dueAt, assigneeId });
    await api.taskTargets.create({ taskId: task.id, targetCompanyId: company.id });

    const onRecord = await api.taskTargets.list({ filter: `targetCompanyId[eq]:"${company.id}"` });
    expect(onRecord.records.map((target) => target.taskId)).toEqual([task.id]);
    const assigned = await api.tasks.list({
      filter: `and(assigneeId[eq]:"${assigneeId}",id[eq]:"${task.id}")`,
    });
    expect(assigned.records).toEqual([
      expect.objectContaining({ dueAt, status: 'TODO', assigneeId }),
    ]);
  });

  test('a task marked done stays done', async ({ api }) => {
    const task = await api.tasks.create({ title: 'Изпрати оферта' });

    await api.tasks.update(task.id, { status: 'DONE' });

    expect((await api.tasks.get(task.id)).status).toBe('DONE');
  });
});

test.describe('files', () => {
  test('a file attached to a company downloads unchanged, under its Cyrillic name', async ({
    request,
    api,
    adminToken,
  }) => {
    const company = await api.companies.create(companyInput());
    const content = Buffer.from('Оферта за 2027 г.\nЦена: 12 000 лв.\n', 'utf8');

    const attachment = await attach(
      api,
      new FilesApi(request, adminToken),
      company,
      'оферта.txt',
      content,
    );

    const [file] = (await api.attachments.get(attachment.id)).file;
    expect(file?.label).toBe('оферта.txt');
    const download = await request.get(file?.url ?? '');
    expect(download.status()).toBe(200);
    expect(await download.body()).toEqual(content);
  });

  test('a file over 1 GiB is refused before it is sent, naming the limit', async ({
    request,
    adminToken,
  }) => {
    const refusal = await new FilesApi(request, adminToken).start('архив.zip', 2 * 1024 ** 3).then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(refusal).toBeInstanceOf(GraphQLError);
    expect((refusal as GraphQLError).messages.join(' ')).toContain('max 1073741824 bytes');
  });

  test('an upload larger than it was declared is cut off', async ({ request, adminToken }) => {
    const files = new FilesApi(request, adminToken);
    const target = await files.start('бележки.txt', 3);

    const sent = await files.put(target, Buffer.alloc(30, 'я'));

    expect(sent.status()).toBe(413);
    expect(await sent.json()).toMatchObject({ code: 'FILE_TOO_LARGE' });
  });

  test('an HTML file is served as a download, not as a page of the app', async ({
    request,
    api,
    adminToken,
  }) => {
    const company = await api.companies.create(companyInput());
    const page = Buffer.from('<html><body><script>document.title = "ran"</script></body></html>');

    const attachment = await attach(
      api,
      new FilesApi(request, adminToken),
      company,
      'page.html',
      page,
    );

    const download = await request.get(attachment.file[0]?.url ?? '');
    expect(download.headers()['content-disposition']).toMatch(/^attachment/);
    expect(download.headers()['x-content-type-options']).toBe('nosniff');
  });

  test('an SVG loses its script when it is uploaded, and is served as a download', async ({
    request,
    api,
    adminToken,
  }) => {
    const company = await api.companies.create(companyInput());
    const image = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>document.title = "ran"</script><circle r="5"/></svg>',
    );

    const attachment = await attach(
      api,
      new FilesApi(request, adminToken),
      company,
      'logo.svg',
      image,
    );

    const download = await request.get(attachment.file[0]?.url ?? '');
    const served = (await download.body()).toString('utf8');
    expect(served).not.toContain('<script');
    expect(served).toContain('<circle');
    expect(download.headers()['content-disposition']).toMatch(/^attachment/);
  });

  test('the download link signs nobody in, and lasts no more than a day', async ({
    request,
    api,
    adminToken,
  }) => {
    const company = await api.companies.create(companyInput());
    const attachment = await attach(
      api,
      new FilesApi(request, adminToken),
      company,
      'бележка.txt',
      Buffer.from('текст'),
    );

    const token = new URL(attachment.file[0]?.url ?? '').searchParams.get('token') ?? '';
    const claims = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString()) as {
      type: string;
      iat: number;
      exp: number;
    };
    expect(claims.type).toBe('FILE');
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(24 * 60 * 60);
    const asApi = await apiFor(request, token).rest.send('GET', '/rest/companies');
    expect(asApi.ok(), 'the file token is refused by the API').toBe(false);
  });
});

test.describe('who may read them', () => {
  // Notes, tasks and attachments are objects of their own, with their own permissions:
  // a role without access to companies still reads what is attached to one, unless the
  // admin limits those objects too ("Checked, not a finding").

  test("a role without access to companies still reads a company's notes, tasks and files", async ({
    request,
    api,
    adminToken,
    roles,
  }) => {
    const company = await api.companies.create(companyInput());
    const note = await api.notes.create({ title: 'Поверително', bodyV2: { markdown: 'Цена' } });
    await api.noteTargets.create({ noteId: note.id, targetCompanyId: company.id });
    const attachment = await attach(
      api,
      new FilesApi(request, adminToken),
      company,
      'цени.txt',
      Buffer.from('12 000'),
    );
    const role = await roles.create();
    await roles.limitObject(role, 'company', NO_ACCESS);
    const theirs = apiFor(request, (await roles.apiKey(role)).token);

    await expectDenied(await theirs.rest.send('GET', `/rest/companies/${company.id}`));
    expect((await theirs.notes.get(note.id)).bodyV2.markdown).toBe('Цена');
    const files = await theirs.attachments.list({ filter: `targetCompanyId[eq]:"${company.id}"` });
    expect(files.records.map((file) => file.id)).toEqual([attachment.id]);
  });

  test('a role without access to attachments gets neither them nor their download links', async ({
    request,
    api,
    adminToken,
    roles,
  }) => {
    const company = await api.companies.create(companyInput());
    const attachment = await attach(
      api,
      new FilesApi(request, adminToken),
      company,
      'цени.txt',
      Buffer.from('12 000'),
    );
    const role = await roles.create();
    await roles.limitObject(role, 'attachment', NO_ACCESS);
    const theirs = apiFor(request, (await roles.apiKey(role)).token).rest;

    await expectDenied(await theirs.send('GET', `/rest/attachments/${attachment.id}`));
    await expectDenied(
      await theirs.send('GET', '/rest/attachments', {
        params: { filter: `targetCompanyId[eq]:"${company.id}"` },
      }),
    );
  });
});
