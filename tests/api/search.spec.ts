import { GraphQLError } from '../../src/api/graphql';
import { search } from '../../src/api/search';
import { companyInput, opportunityInput, personInput, uniqueWord } from '../../src/data/factories';
import { apiFor, expect, test } from '../../src/fixtures';

// Each test searches for a made-up word of its own, so only its records can match.

// Cyrillic letters and their Latin twins, which look the same.
const CYRILLIC = 'аеорксхуКОРС';
const LATIN = 'aeopkcxyKOPC';

/** The text with Latin twins in place of its Cyrillic letters. */
const lookalikes = (text: string): string =>
  text.replace(
    new RegExp(`[${CYRILLIC}]`, 'g'),
    (letter) => LATIN[CYRILLIC.indexOf(letter)] ?? letter,
  );

test.describe('search', () => {
  test('finds companies, people and opportunities by name', async ({ request, api, workspace }) => {
    const word = uniqueWord();
    const company = await api.companies.create(companyInput({ name: `${word} ООД` }));
    const person = await api.people.create(
      personInput({ name: { firstName: word, lastName: 'Петров' } }),
    );
    const deal = await api.opportunities.create(opportunityInput({ name: `Сделка ${word}` }));

    const found = await search(request, workspace.apiKey, word);

    expect(found.map((one) => [one.objectNameSingular, one.recordId, one.label]).sort()).toEqual(
      [
        ['company', company.id, `${word} ООД`],
        ['opportunity', deal.id, `Сделка ${word}`],
        ['person', person.id, `${word} Петров`],
      ].sort(),
    );
  });

  test('finds a Cyrillic name by the start of a word, in any case', async ({
    request,
    api,
    workspace,
  }) => {
    const word = uniqueWord();
    const company = await api.companies.create(companyInput({ name: `${word} ООД` }));
    const start = word.slice(0, 7);

    for (const text of [start, start.toLowerCase(), start.toUpperCase(), word.toUpperCase()]) {
      const found = await search(request, workspace.apiKey, text);
      expect(
        found.map((one) => one.recordId),
        text,
      ).toContain(company.id);
    }
  });

  test('does not take Latin letters that look Cyrillic for them', async ({
    request,
    api,
    workspace,
  }) => {
    // The word starts with Cyrillic letters that have Latin twins: К, о, р and с.
    const word = `Корс${uniqueWord()}`;
    await api.companies.create(companyInput({ name: `${word} ООД` }));

    const found = await search(request, workspace.apiKey, lookalikes(word));

    expect(lookalikes(word)).not.toBe(word);
    expect(found).toEqual([]);
    expect(await search(request, workspace.apiKey, word)).toHaveLength(1);
  });

  test('follows a rename, and no longer finds a deleted record', async ({
    request,
    api,
    workspace,
  }) => {
    const [before, after] = [uniqueWord(), uniqueWord()];
    const company = await api.companies.create(companyInput({ name: `${before} ООД` }));

    await api.companies.update(company.id, { name: `${after} ООД` });

    expect(await search(request, workspace.apiKey, before)).toEqual([]);
    expect((await search(request, workspace.apiKey, after)).map((one) => one.recordId)).toEqual([
      company.id,
    ]);

    await api.companies.delete(company.id);

    expect(await search(request, workspace.apiKey, after)).toEqual([]);
  });

  test("finds nothing of another workspace's records", async ({
    request,
    api,
    workspace,
    otherWorkspace,
  }) => {
    const ours = uniqueWord();
    const theirs = uniqueWord();
    await api.companies.create(companyInput({ name: `${ours} ООД` }));
    await apiFor(request, otherWorkspace.apiKey).companies.create(
      companyInput({ name: `${theirs} ООД` }),
    );

    expect(await search(request, otherWorkspace.apiKey, ours)).toEqual([]);
    expect(await search(request, workspace.apiKey, theirs)).toEqual([]);
    expect(await search(request, workspace.apiKey, ours)).toHaveLength(1);
    expect(await search(request, otherWorkspace.apiKey, theirs)).toHaveLength(1);
  });

  test('finds for a role only the objects it may read', async ({ request, api, roles }) => {
    const role = await roles.create();
    await roles.limitObject(role, 'company', {
      canReadObjectRecords: false,
      canUpdateObjectRecords: false,
      canSoftDeleteObjectRecords: false,
      canDestroyObjectRecords: false,
    });
    const key = await roles.apiKey(role);
    const word = uniqueWord();
    await api.companies.create(companyInput({ name: `${word} ООД` }));
    const person = await api.people.create(
      personInput({ name: { firstName: word, lastName: 'Петров' } }),
    );

    const people = await search(request, key.token, word, ['person']);
    const companies = await search(request, key.token, word, ['company']).catch(
      (error: unknown) => error,
    );
    // A search of every object, companies included, is refused as a whole; the app asks
    // only for the objects the role may read.
    const everything = await search(request, key.token, word).catch((error: unknown) => error);

    expect(people.map((one) => one.recordId)).toEqual([person.id]);
    expect(companies).toBeInstanceOf(GraphQLError);
    expect((companies as GraphQLError).codes).toEqual(['FORBIDDEN']);
    expect(everything).toBeInstanceOf(GraphQLError);
  });
});
