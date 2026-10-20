import { expect, test } from '@playwright/test';
import { z } from 'zod';

import { selectionOf } from '../../src/api/graphql-records';
import { Opportunity } from '../../src/schemas/records';

test.describe('GraphQL selection from a schema', () => {
  test('asks for nested objects with their fields, and arrays as plain values', () => {
    const schema = z.object({
      id: z.uuid(),
      name: z.object({ firstName: z.string() }).nullable(),
      tags: z.array(z.string()),
      owner: z.object({ id: z.uuid(), team: z.object({ name: z.string() }) }).optional(),
    });

    expect(selectionOf(schema)).toBe('id name { firstName } tags owner { id team { name } }');
  });

  test('covers every field the opportunity contract checks', () => {
    const selection = selectionOf(Opportunity);

    expect(selection).toContain('amount { amountMicros currencyCode }');
    expect(selection).toContain('createdBy { source workspaceMemberId name }');
    for (const field of Object.keys(Opportunity.shape)) expect(selection).toContain(field);
  });
});
