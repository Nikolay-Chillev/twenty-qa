import { z } from 'zod';

import { graphql, GraphQLError } from '../../src/api/graphql';
import { RestErrorBody } from '../../src/api/rest';
import {
  renewTokens,
  signInForTokens,
  withBrokenSignature,
  withPayload,
} from '../../src/auth/tokens';
import { USERS } from '../../src/auth/users';
import { apiFor, expect, test } from '../../src/fixtures';

/** What REST answers for a token, e.g. `401 Token invalid.` */
async function restAnswer(
  api: ReturnType<typeof apiFor>,
): Promise<{ status: number; messages?: string[] }> {
  const response = await api.rest.send('GET', '/rest/companies', { params: { limit: 1 } });
  if (response.ok()) return { status: response.status() };
  return {
    status: response.status(),
    messages: RestErrorBody.parse(await response.json()).messages,
  };
}

/** The error a call failed with. */
async function failure(call: Promise<unknown>): Promise<GraphQLError> {
  const error = await call.then(
    () => undefined,
    (refusal: unknown) => refusal,
  );
  expect(error, 'the call fails').toBeInstanceOf(GraphQLError);
  return error as GraphQLError;
}

test.describe('tokens', () => {
  test('an access token with a changed signature is refused, over REST and GraphQL', async ({
    request,
    password,
  }) => {
    const { access } = await signInForTokens(request, USERS.member, password);
    const forged = withBrokenSignature(access);

    expect(await restAnswer(apiFor(request, access))).toEqual({ status: 200 });
    expect(await restAnswer(apiFor(request, forged))).toEqual({
      status: 401,
      messages: ['Token invalid.'],
    });
    const error = await failure(
      graphql(request, '/metadata', {
        query: '{ currentUser { id } }',
        token: forged,
        data: z.unknown(),
      }),
    );
    expect(error.codes).toEqual(['UNAUTHENTICATED']);
  });

  test('an access token changed to name another workspace is refused', async ({
    request,
    password,
    otherWorkspace,
  }) => {
    const { access } = await signInForTokens(request, USERS.member, password);

    const forged = withPayload(access, { workspaceId: otherWorkspace.id });

    expect(await restAnswer(apiFor(request, forged))).toEqual({
      status: 401,
      messages: ['Token invalid.'],
    });
  });

  test('an API key stops working once it expires', async ({ request, roles }) => {
    // The key lives 10 seconds, then the test waits for it to expire.
    test.slow();
    const role = await roles.create();
    // Counted from now, after the role, so a slow runner still has time to make the
    // key and use it once.
    const expiresAt = new Date(Date.now() + 10_000).toISOString();
    const key = await roles.apiKey(role, expiresAt);

    expect(await restAnswer(apiFor(request, key.token))).toEqual({ status: 200 });
    await expect
      .poll(() => restAnswer(apiFor(request, key.token)), { timeout: 30_000 })
      .toEqual({ status: 401, messages: ['Token has expired.'] });
  });

  // Since 2.65.0 Twenty no longer issues refresh tokens to a sign-in: the web app keeps
  // its session in a cookie, and renewToken is deprecated.
  test('signing in gives a working access token and no refresh token', async ({
    request,
    password,
  }) => {
    const { access, refresh } = await signInForTokens(request, USERS.member, password);

    expect(refresh).toBeNull();
    expect(await restAnswer(apiFor(request, access))).toEqual({ status: 200 });
  });

  test('renewal refuses an access token, and a changed one, in place of a refresh token', async ({
    request,
    password,
  }) => {
    const { access } = await signInForTokens(request, USERS.member, password);

    const notRefresh = await failure(renewTokens(request, access));
    const changed = await failure(renewTokens(request, withBrokenSignature(access)));

    expect(notRefresh.messages).toEqual(['Expected a refresh token']);
    expect(changed.messages).toEqual(['Token invalid.']);
  });
});
