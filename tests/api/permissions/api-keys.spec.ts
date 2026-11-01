import { z } from 'zod';

import { graphql, GraphQLError } from '../../../src/api/graphql';
import { RestErrorBody } from '../../../src/api/rest';
import { expectForbidden } from '../../../src/api/refusals';
import { RolesApi } from '../../../src/auth/roles';
import { apiFor, expect, test } from '../../../src/fixtures';

test.describe('API keys', () => {
  test('a revoked key stops working at once, over REST and GraphQL', async ({ request, roles }) => {
    const key = await roles.apiKey(await roles.create());
    const companies = () =>
      graphql(request, '/graphql', {
        query: '{ companies(first: 1) { edges { node { id } } } }',
        token: key.token,
        data: z.unknown(),
      });
    expect((await apiFor(request, key.token).rest.send('GET', '/rest/companies')).status()).toBe(
      200,
    );

    await roles.revoke(key.id);

    const response = await apiFor(request, key.token).rest.send('GET', '/rest/companies');
    expect(response.status()).toBe(403);
    expect(RestErrorBody.parse(await response.json()).messages).toEqual([
      'This API Key is revoked',
    ]);
    expect(await expectForbidden(companies())).toBe('This API Key is revoked');
  });

  test('a role that is not for API keys cannot be given to one', async ({ roles }) => {
    // Member is for users only; a key with it would get rights no one chose for it.
    const refusal = await roles.apiKey(await roles.idOf('Member')).catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(GraphQLError);
    expect((refusal as GraphQLError).codes).toEqual(['METADATA_VALIDATION_FAILED']);
  });

  test('a key may not make API keys, even with the Admin role', async ({ request, workspace }) => {
    // The suite's own key has the Admin role.
    const asKey = new RolesApi(request, workspace.apiKey);

    await expectForbidden(asKey.apiKey(await asKey.idOf('Admin')));
  });
});
