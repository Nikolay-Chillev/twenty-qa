import { companyInput, personInput } from '../../../src/data/factories';
import { expect, test } from '../../../src/fixtures';

test.describe('values survive a round trip unchanged', () => {
  test('Cyrillic, quotes, markup and emoji written over REST read the same over GraphQL', async ({
    api,
    gql,
  }) => {
    const person = await api.people.create(
      personInput({
        name: { firstName: 'Йордан „Данчо“', lastName: "Ковачев-О'Нийл" },
        jobTitle: 'Р&Д мениджър <b>ключов</b> 🚀',
      }),
    );

    const read = await gql.people.get(person.id);

    expect(read.name).toEqual({ firstName: 'Йордан „Данчо“', lastName: "Ковачев-О'Нийл" });
    expect(read.jobTitle).toBe('Р&Д мениджър <b>ключов</b> 🚀');
  });

  test('Cyrillic written over GraphQL reads the same over REST', async ({ api, gql }) => {
    const company = await gql.companies.create(
      companyInput({ name: 'Щастливи & Ючи ЕООД', address: { addressCity: 'Велико Търново' } }),
    );

    const read = await api.companies.get(company.id);

    expect(read.name).toBe('Щастливи & Ючи ЕООД');
    expect(read.address.addressCity).toBe('Велико Търново');
  });

  test('an international phone number is stored in its national form', async ({ api }) => {
    const person = await api.people.create(
      personInput({
        phones: { primaryPhoneNumber: '+359 88 123 4567', primaryPhoneCallingCode: '+359' },
      }),
    );

    expect(person.phones).toMatchObject({
      primaryPhoneNumber: '881234567',
      primaryPhoneCountryCode: 'BG',
      primaryPhoneCallingCode: '+359',
    });
  });

  test('a 10,000-character name is stored in full', async ({ api }) => {
    const name = 'Ж'.repeat(10_000);

    const company = await api.companies.create(companyInput({ name }));

    expect((await api.companies.get(company.id)).name).toBe(name);
  });
});
