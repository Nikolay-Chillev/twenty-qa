import { randomUUID } from 'node:crypto';

import { companyInput, personInput, uniqueWord } from '../../src/data/factories';
import { expect, test } from '../../src/fixtures';
import { csv, exportedLines, exportView, ImportDialog } from '../../src/ui/csv';
import { COMPANIES, PEOPLE, RecordIndexPage } from '../../src/ui/record-table';

// Cells a spreadsheet would take for a formula get this invisible character in front.
const ZWJ = '\u200D';
const EMAIL_FIELD = 'Emails / Primary Email ·Emails';

/** An address unique to the test, in lower case as Twenty keeps emails. */
const address = () => `qa-${randomUUID()}@example.com`;

test.describe('CSV import', () => {
  test('a file of companies with Cyrillic, quotes, commas and empty cells reads as in the file', async ({
    page,
    api,
  }) => {
    const tag = uniqueWord();
    const domain = (name: string) => `${name}-${randomUUID().slice(0, 8)}.bg`;
    const rows = [
      [`${tag} Алфа, ООД`, domain('alfa'), 'София'],
      [`${tag} "Бета"`, '', 'Пловдив'],
      [`${tag} Гама`, domain('gama'), ''],
    ];
    await new RecordIndexPage(page, COMPANIES).open();
    const importing = await new ImportDialog(page).start('Companies', {
      name: 'фирми.csv',
      content: csv([['Name', 'Domain', 'City'], ...rows]),
    });

    await importing.match(1, 'Link URL', 'Domain Name / Link URL ·Links');
    await importing.validate();
    expect(await importing.rowsWithErrors()).toEqual([]);
    await importing.confirm();

    const { records } = await api.companies.list({ filter: `name[like]:"%${tag}%"` });
    const imported = records.map((company) => [
      company.name,
      company.domainName.primaryLinkUrl,
      company.address.addressCity,
    ]);
    expect(imported.sort()).toEqual(rows.sort());
  });

  test('a row with an error is flagged by field, and only the valid rows are imported', async ({
    page,
    api,
  }) => {
    const tag = uniqueWord();
    await new RecordIndexPage(page, PEOPLE).open();
    const importing = await new ImportDialog(page).start('People', {
      name: 'хора.csv',
      content: csv([
        ['First Name', 'Last Name', 'Email'],
        ['Иван', tag, address()],
        ['Грешен', tag, 'ivan.petrov'],
      ]),
    });

    await importing.match(2, 'Primary Email', EMAIL_FIELD);
    await importing.validate();

    expect(await importing.rowsWithErrors()).toEqual([`ivan.petrov Грешен ${tag}`]);
    expect(await importing.errorOf('ivan.petrov')).toBe(
      'Emails / Primary Email is not a valid email',
    );
    await importing.confirm({ withErrors: true });
    const { records } = await api.people.list({ filter: `name.lastName[eq]:"${tag}"` });
    expect(records.map((person) => person.name.firstName)).toEqual(['Иван']);
  });

  test('an email twice in the file is flagged, and a known email updates that person', async ({
    page,
    api,
  }) => {
    const tag = uniqueWord();
    const known = await api.people.create(
      personInput({ name: { firstName: 'Стар', lastName: tag } }),
    );
    const twice = address();
    await new RecordIndexPage(page, PEOPLE).open();
    const importing = await new ImportDialog(page).start('People', {
      name: 'хора.csv',
      content: csv([
        ['First Name', 'Last Name', 'Email'],
        ['Нов', tag, known.emails.primaryEmail],
        ['Двойник', tag, twice],
        ['Близнак', tag, twice],
      ]),
    });
    await importing.match(2, 'Primary Email', EMAIL_FIELD);
    await importing.validate();

    expect(await importing.rowsWithErrors()).toEqual([
      `${twice} Двойник ${tag}`,
      `${twice} Близнак ${tag}`,
    ]);
    expect(await importing.errorOf(twice)).toBe(
      'This Primary Email (emails) value already exists in your import data',
    );
    await importing.confirm({ withErrors: true });

    // As Twenty's guide on updating records by import says: the email matches the
    // person, who is updated rather than created twice.
    const { records } = await api.people.list({ filter: `name.lastName[eq]:"${tag}"` });
    expect(records.map(({ id, name }) => ({ id, firstName: name.firstName }))).toEqual([
      { id: known.id, firstName: 'Нов' },
    ]);
  });

  test('columns go to the fields the user chooses, and a column left unmatched is not imported', async ({
    page,
    api,
  }) => {
    const tag = uniqueWord();
    await new RecordIndexPage(page, PEOPLE).open();
    const importing = await new ImportDialog(page).start('People', {
      name: 'хора.csv',
      content: csv([
        ['First Name', 'Last Name', 'Длъжност', 'Бележка'],
        ['Мария', tag, 'Счетоводител', 'да не се внася'],
      ]),
    });
    await expect(importing.columnField(3)).toHaveText('Select column...');

    await importing.match(2, 'Job', 'Job Title ·Text');
    await importing.validate();
    await importing.confirm();

    const { records } = await api.people.list({ filter: `name.lastName[eq]:"${tag}"` });
    expect(records).toEqual([expect.objectContaining({ jobTitle: 'Счетоводител' })]);
    expect(JSON.stringify(records)).not.toContain('да не се внася');
  });
});

test.describe('CSV export', () => {
  test('a table is exported with the records and columns of its view, in UTF-8 with a BOM', async ({
    page,
    api,
  }) => {
    const tag = uniqueWord();
    await api.companies.create(companyInput({ name: `${tag} "Алфа", ООД` }));
    await api.companies.create(companyInput({ name: `${tag} Бета` }));
    const companies = await new RecordIndexPage(page, COMPANIES).open(tag);
    await expect(companies.table.rows).toHaveCount(2);

    const file = await exportView(page);

    expect(file.name).toBe('company.csv');
    // A byte order mark, so a spreadsheet opens the Cyrillic as UTF-8.
    expect([...file.content.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const [header = '', ...lines] = exportedLines(file.content);
    expect(header.split(',')).toEqual(expect.arrayContaining(['Name', 'Creation date']));
    // A field the view does not show is not exported.
    expect(header).not.toContain('Employees');
    expect(lines).toHaveLength(2);
    expect(lines.join('\n')).toContain(`"${tag} ""Алфа"", ООД"`);
    expect(lines.join('\n')).toContain(`${tag} Бета`);
  });

  test('a value starting with =, +, - or @ is exported so that a spreadsheet reads it as text', async ({
    page,
    api,
  }) => {
    const tag = uniqueWord();
    const formulas = ['=1+2', '+1', '-1', '@SUM(1)'].map((start) => `${start} ${tag}`);
    for (const name of [...formulas, `Обикновена ${tag}`]) {
      await api.companies.create(companyInput({ name }));
    }
    const companies = await new RecordIndexPage(page, COMPANIES).open(tag);
    await expect(companies.table.rows).toHaveCount(5);

    const file = await exportView(page);

    const text = file.content.toString('utf8');
    for (const name of formulas) expect(text).toContain(`,${ZWJ}${name},`);
    expect(text).toContain(`,Обикновена ${tag},`);
  });

  test('a file exported and imported back leaves the record as it was', async ({ page, api }) => {
    const tag = uniqueWord();
    const person = await api.people.create(
      personInput({
        name: { firstName: tag, lastName: '-Минус' },
        jobTitle: '=Директор',
        phones: { primaryPhoneNumber: '881234567', primaryPhoneCallingCode: '+359' },
      }),
    );
    const people = await new RecordIndexPage(page, PEOPLE).open(tag);
    await expect(people.table.rows).toHaveCount(1);
    const file = await exportView(page);

    // The exported columns match the fields by themselves, the record's id among them.
    const importing = await new ImportDialog(page).start('People', {
      name: file.name,
      content: file.content,
    });
    await importing.validate();
    await importing.confirm();

    await expect
      .poll(async () => (await api.people.get(person.id)).updatedAt)
      .not.toBe(person.updatedAt);
    const after = await api.people.get(person.id);
    expect({ name: after.name, jobTitle: after.jobTitle, phones: after.phones }).toEqual({
      name: person.name,
      jobTitle: person.jobTitle,
      phones: person.phones,
    });
    const { records } = await api.people.list({ filter: `name.firstName[eq]:"${tag}"` });
    expect(records).toHaveLength(1);
  });
});
