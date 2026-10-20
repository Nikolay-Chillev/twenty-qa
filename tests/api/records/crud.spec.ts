import { randomUUID } from 'node:crypto';

import type { CrudApi } from '../../../src/api/records';
import {
  companyInput,
  opportunityInput,
  personInput,
  personName,
} from '../../../src/data/factories';
import { type Api, expect, type GraphQLApi, test } from '../../../src/fixtures';

type Via = 'REST' | 'GraphQL';

interface ObjectUnderTest<Item, Input> {
  name: string;
  client: (apis: { api: Api; gql: GraphQLApi }, via: Via) => CrudApi<Item, Input>;
  build: () => Input;
  /** A change to some fields; the others must stay as they were. */
  change: () => Input;
}

/** The fields of an input, in the shape `toMatchObject` takes. */
const fieldsOf = (input: object): Record<string, unknown> =>
  Object.fromEntries(Object.entries(input));

/** The record without `updatedAt` and without the fields a change sets. */
function untouched(record: object, change: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([field]) => field !== 'updatedAt' && !(field in change)),
  );
}

function describeCrud<Item extends { id: string }, Input extends object>(
  object: ObjectUnderTest<Item, Input>,
): void {
  for (const via of ['REST', 'GraphQL'] as const) {
    test.describe(`${object.name} over ${via}`, () => {
      test('is created with the values sent', async ({ api, gql }) => {
        const input = object.build();

        const created = await object.client({ api, gql }, via).create(input);

        expect(created).toMatchObject(fieldsOf(input));
      });

      test('reads back as it was created', async ({ api, gql }) => {
        const client = object.client({ api, gql }, via);
        const created = await client.create(object.build());

        expect(await client.get(created.id)).toEqual(created);
      });

      test('is updated, keeping the fields not sent', async ({ api, gql }) => {
        const client = object.client({ api, gql }, via);
        const created = await client.create(object.build());
        const change = object.change();

        const updated = await client.update(created.id, change);

        expect(updated).toMatchObject(fieldsOf(change));
        expect(untouched(updated, change)).toEqual(untouched(created, change));
        expect(await client.get(created.id)).toEqual(updated);
      });

      test('is deleted and no longer found', async ({ api, gql }) => {
        const client = object.client({ api, gql }, via);
        const created = await client.create(object.build());

        await client.delete(created.id);

        await expect(client.get(created.id)).rejects.toThrow(/Record not found/);
      });
    });
  }
}

describeCrud({
  name: 'a company',
  client: ({ api, gql }, via) => (via === 'REST' ? api.companies : gql.companies),
  build: () => companyInput(),
  change: () => ({
    name: `Преименувана ${randomUUID().slice(0, 8)} ЕООД`,
    domainName: { primaryLinkUrl: `renamed-${randomUUID().slice(0, 8)}.bg` },
  }),
});

describeCrud({
  name: 'a person',
  client: ({ api, gql }, via) => (via === 'REST' ? api.people : gql.people),
  build: () => personInput(),
  change: () => ({ name: personName(), jobTitle: 'Търговски директор' }),
});

describeCrud({
  name: 'an opportunity',
  client: ({ api, gql }, via) => (via === 'REST' ? api.opportunities : gql.opportunities),
  build: () => opportunityInput(),
  change: () => ({
    stage: 'PROPOSAL' as const,
    amount: { amountMicros: 20_000_000_000, currencyCode: 'EUR' },
  }),
});
