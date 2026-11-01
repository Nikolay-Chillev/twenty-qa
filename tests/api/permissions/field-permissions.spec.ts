import type { APIRequestContext } from '@playwright/test';
import { z } from 'zod';

import { graphql } from '../../../src/api/graphql';
import { expectDenied, expectForbidden } from '../../../src/api/refusals';
import type { FieldRights, RolesApi } from '../../../src/auth/roles';
import { companyInput } from '../../../src/data/factories';
import { apiFor, expect, graphqlFor, test } from '../../../src/fixtures';

const HIDDEN: FieldRights = { canReadFieldValue: false, canUpdateFieldValue: false };
const READ_ONLY: FieldRights = { canUpdateFieldValue: false };
const REVENUE = { amountMicros: 250_000_000_000, currencyCode: 'EUR' };

/** The token of a new API key whose role has these rights on one field of companies. */
async function keyFor(roles: RolesApi, field: string, rights: FieldRights): Promise<string> {
  const role = await roles.create();
  await roles.limitField(role, 'company', field, rights);
  return (await roles.apiKey(role)).token;
}

/** A company over GraphQL, with only the fields asked for, e.g. `id name`. */
function companyOverGraphql(request: APIRequestContext, token: string, id: string, fields: string) {
  return graphql(request, '/graphql', {
    query: `query($id: UUID!) { company(filter: { id: { eq: $id } }) { ${fields} } }`,
    variables: { id },
    token,
    data: z.object({ company: z.record(z.string(), z.unknown()) }),
  });
}

test.describe('a hidden field', () => {
  test('is left out of the records the role reads', async ({ request, api, roles }) => {
    const key = await keyFor(roles, 'annualRevenue', HIDDEN);
    const company = await api.companies.create(companyInput({ annualRevenue: REVENUE }));

    const { data } = await apiFor(request, key).rest.call(
      'GET',
      `/rest/companies/${company.id}`,
      z.object({ data: z.object({ company: z.record(z.string(), z.unknown()) }) }),
    );
    const overGraphql = await companyOverGraphql(request, key, company.id, 'id name');

    expect(data.company).toMatchObject({ id: company.id, name: company.name });
    expect(data.company).not.toHaveProperty('annualRevenue');
    expect(overGraphql.company).toEqual({ id: company.id, name: company.name });
    expect(
      await expectForbidden(
        companyOverGraphql(request, key, company.id, 'id annualRevenue { amountMicros }'),
      ),
    ).toContain('no permission to read field "annualRevenue"');
  });

  test('may not be filtered on or changed', async ({ request, api, roles }) => {
    const key = await keyFor(roles, 'annualRevenue', HIDDEN);
    const company = await api.companies.create(companyInput({ annualRevenue: REVENUE }));
    const rest = apiFor(request, key).rest;

    await expectDenied(
      await rest.send('GET', '/rest/companies', {
        params: { filter: 'annualRevenue.amountMicros[gte]:1' },
      }),
    );
    expect(
      await expectDenied(
        await rest.send('PATCH', `/rest/companies/${company.id}`, {
          data: { annualRevenue: { amountMicros: 1_000_000, currencyCode: 'EUR' } },
        }),
      ),
    ).toContain('no permission to write field "annualRevenue"');

    expect((await api.companies.get(company.id)).annualRevenue).toEqual(REVENUE);
  });
});

test('a read-only field is read, but not changed, over REST and GraphQL', async ({
  request,
  api,
  roles,
}) => {
  const key = await keyFor(roles, 'domainName', READ_ONLY);
  const company = await api.companies.create(companyInput());
  const domain = { primaryLinkUrl: 'qa-changed.example' };

  const read = await apiFor(request, key).companies.get(company.id);
  const renamed = await graphqlFor(request, key).companies.update(company.id, {
    name: `${company.name} (2)`,
  });

  expect(read.domainName).toEqual(company.domainName);
  expect(renamed.name).toBe(`${company.name} (2)`);
  expect(
    await expectDenied(
      await apiFor(request, key).rest.send('PATCH', `/rest/companies/${company.id}`, {
        data: { domainName: domain },
      }),
    ),
  ).toContain('no permission to write field "domainName"');
  await expectForbidden(
    graphqlFor(request, key).companies.update(company.id, { domainName: domain }),
  );
  expect((await api.companies.get(company.id)).domainName).toEqual(company.domainName);
});
