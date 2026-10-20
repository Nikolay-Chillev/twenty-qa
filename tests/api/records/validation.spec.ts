import type { APIResponse } from '@playwright/test';

import { RestErrorBody } from '../../../src/api/rest';
import { companyInput, opportunityInput, personInput } from '../../../src/data/factories';
import { uniqueAddress } from '../../../src/mail/mailbox';
import { expect, test } from '../../../src/fixtures';

const ISSUES = 'https://github.com/Nikolay-Chillev/twenty-qa/issues';
const NO_SUCH_COMPANY = '00000000-0000-4000-8000-000000000000';

/** Checks that the API refused the request as invalid, and returns its messages. */
async function expectRefusal(response: APIResponse): Promise<string> {
  expect(response.status()).toBe(400);
  return RestErrorBody.parse(await response.json()).messages.join(' ');
}

test.describe('records refuse invalid input', () => {
  test('a value of the wrong type, naming the field', async ({ api }) => {
    const response = await api.rest.send('POST', '/rest/companies', { data: { name: 123 } });

    expect(await expectRefusal(response)).toContain('"name"');
  });

  test('a field the object does not have', async ({ api }) => {
    const response = await api.rest.send('POST', '/rest/companies', {
      data: { ...companyInput(), turnover: 1_000_000 },
    });

    expect(await expectRefusal(response)).toContain(`doesn't have any "turnover" field`);
  });

  test('an email address that is not one', async ({ api }) => {
    const response = await api.rest.send('POST', '/rest/people', {
      data: personInput({ emails: { primaryEmail: 'ivan.petrov' } }),
    });

    expect(await expectRefusal(response)).toContain('emails.primaryEmail');
  });

  test('a website that is not a domain name', async ({ api }) => {
    const response = await api.rest.send('POST', '/rest/companies', {
      data: companyInput({ domainName: { primaryLinkUrl: 'не е адрес' } }),
    });

    expect(await expectRefusal(response)).toContain('domainName.primaryLinkUrl');
  });

  test('a phone number without a single digit', async ({ api }) => {
    const response = await api.rest.send('POST', '/rest/people', {
      data: personInput({
        phones: { primaryPhoneNumber: 'телефон', primaryPhoneCallingCode: '+359' },
      }),
    });

    expect(await expectRefusal(response)).toContain('phone number is invalid');
  });

  for (const [number, title] of [
    ['088-ABC', 'a phone number with letters after the digits, cut off without a word'],
    ['12', 'a phone number too short for any Bulgarian number'],
    ['08812345678901234', 'a phone number longer than the 15 digits E.164 allows'],
  ] as const) {
    test.fail(
      title,
      { annotation: { type: 'issue', description: `${ISSUES}/32` } },
      async ({ api }) => {
        const response = await api.rest.send('POST', '/rest/people', {
          data: personInput({
            phones: { primaryPhoneNumber: number, primaryPhoneCallingCode: '+359' },
          }),
        });

        await expectRefusal(response);
      },
    );
  }

  test('a stage that does not exist, listing the valid ones', async ({ api }) => {
    const response = await api.rest.send('POST', '/rest/opportunities', {
      data: { ...opportunityInput(), stage: 'WON' },
    });

    expect(await expectRefusal(response)).toContain('NEW, SCREENING, MEETING, PROPOSAL, CUSTOMER');
  });

  test('a close date that is not a date', async ({ api }) => {
    const response = await api.rest.send('POST', '/rest/opportunities', {
      data: opportunityInput({ closeDate: 'следващата седмица' }),
    });

    expect(await expectRefusal(response)).toContain('"closeDate"');
  });

  test('a second person with the same email address', async ({ api }) => {
    const email = uniqueAddress();
    await api.people.create(personInput({ emails: { primaryEmail: email } }));

    const response = await api.rest.send('POST', '/rest/people', {
      data: personInput({ emails: { primaryEmail: email } }),
    });

    await expectRefusal(response);
  });

  test('a link to a company that does not exist', async ({ api }) => {
    const response = await api.rest.send('POST', '/rest/people', {
      data: personInput({ companyId: NO_SUCH_COMPANY }),
    });

    await expectRefusal(response);
  });

  test('an email address that is not one, over GraphQL too', async ({ gql }) => {
    await expect(
      gql.people.create(personInput({ emails: { primaryEmail: 'ivan.petrov' } })),
    ).rejects.toThrow(/emails\.primaryEmail/);
  });

  test.fail(
    'a currency code that does not exist',
    { annotation: { type: 'issue', description: `${ISSUES}/30` } },
    async ({ api }) => {
      const response = await api.rest.send('POST', '/rest/opportunities', {
        data: opportunityInput({ amount: { amountMicros: 12_500_000_000, currencyCode: 'XYZ' } }),
      });

      expect(response.status()).toBe(400);
    },
  );
});

test.describe('refusals do not expose the database', () => {
  const internals = /constraint|table "|IDX_|FK_/;

  test.fail(
    'a link to a company that does not exist',
    { annotation: { type: 'issue', description: `${ISSUES}/31` } },
    async ({ api }) => {
      const response = await api.rest.send('POST', '/rest/people', {
        data: personInput({ companyId: NO_SUCH_COMPANY }),
      });

      expect(await expectRefusal(response)).not.toMatch(internals);
    },
  );

  test.fail(
    'a second person with the same email address',
    { annotation: { type: 'issue', description: `${ISSUES}/31` } },
    async ({ api }) => {
      const email = uniqueAddress();
      await api.people.create(personInput({ emails: { primaryEmail: email } }));

      const response = await api.rest.send('POST', '/rest/people', {
        data: personInput({ emails: { primaryEmail: email } }),
      });

      expect(await expectRefusal(response)).not.toMatch(internals);
    },
  );
});

test('a company without a name is saved untitled, as the app creates it', async ({ api }) => {
  const response = await api.rest.send('POST', '/rest/companies', { data: {} });

  expect(response.status()).toBe(201);
  const company = await api.companies.get(
    ((await response.json()) as { data: { createCompany: { id: string } } }).data.createCompany.id,
  );
  expect(company.name).toBe('');
});
