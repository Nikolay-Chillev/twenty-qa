import { z } from 'zod';

import { graphql } from '../../../src/api/graphql';
import { companyInput, opportunityInput, personInput } from '../../../src/data/factories';
import { expect, test } from '../../../src/fixtures';

const PeopleOfCompany = z.object({
  company: z.object({
    people: z.object({ edges: z.array(z.object({ node: z.object({ id: z.uuid() }) })) }),
  }),
});

test.describe('relations between records', () => {
  /** Ids of the people GraphQL lists under a company. */
  async function peopleOf(
    request: Parameters<typeof graphql>[0],
    token: string,
    companyId: string,
  ): Promise<string[]> {
    const data = await graphql(request, '/graphql', {
      query:
        'query($id: UUID!) { company(filter: { id: { eq: $id } }) { people { edges { node { id } } } } }',
      variables: { id: companyId },
      token,
      data: PeopleOfCompany,
    });
    return data.company.people.edges.map((edge) => edge.node.id);
  }

  test('a person linked to a company is among its people', async ({ api, request, workspace }) => {
    const company = await api.companies.create(companyInput());

    const person = await api.people.create(personInput({ companyId: company.id }));

    expect(person.companyId).toBe(company.id);
    expect(await peopleOf(request, workspace.apiKey, company.id)).toEqual([person.id]);
  });

  test('moving a person to another company moves them between the two lists', async ({
    api,
    request,
    workspace,
  }) => {
    const before = await api.companies.create(companyInput());
    const after = await api.companies.create(companyInput());
    const person = await api.people.create(personInput({ companyId: before.id }));

    await api.people.update(person.id, { companyId: after.id });

    expect(await peopleOf(request, workspace.apiKey, before.id)).toEqual([]);
    expect(await peopleOf(request, workspace.apiKey, after.id)).toEqual([person.id]);
  });

  test('a person can be detached from their company', async ({ api, request, workspace }) => {
    const company = await api.companies.create(companyInput());
    const person = await api.people.create(personInput({ companyId: company.id }));

    const detached = await api.people.update(person.id, { companyId: null });

    expect(detached.companyId).toBeNull();
    expect(await peopleOf(request, workspace.apiKey, company.id)).toEqual([]);
  });

  test('an opportunity points to its company and point of contact', async ({
    api,
    request,
    workspace,
  }) => {
    const company = await api.companies.create(companyInput());
    const contact = await api.people.create(personInput({ companyId: company.id }));

    const opportunity = await api.opportunities.create(
      opportunityInput({ companyId: company.id, pointOfContactId: contact.id }),
    );

    const data = await graphql(request, '/graphql', {
      query: `query($id: UUID!) { opportunity(filter: { id: { eq: $id } }) {
        company { id name }
        pointOfContact { id name { firstName lastName } }
      } }`,
      variables: { id: opportunity.id },
      token: workspace.apiKey,
      data: z.object({
        opportunity: z.object({
          company: z.object({ id: z.uuid(), name: z.string() }),
          pointOfContact: z.object({
            id: z.uuid(),
            name: z.object({ firstName: z.string(), lastName: z.string() }),
          }),
        }),
      }),
    });
    expect(data.opportunity.company).toEqual({ id: company.id, name: company.name });
    expect(data.opportunity.pointOfContact).toEqual({ id: contact.id, name: contact.name });
  });
});
