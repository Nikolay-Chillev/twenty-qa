import { type APIResponse, expect } from '@playwright/test';
import { z } from 'zod';

import { GraphQLError } from './graphql';
import { RestErrorBody } from './rest';

// How Twenty refuses a call for lack of permission. Over GraphQL the error's code is
// FORBIDDEN. Over REST the body's code is PERMISSION_DENIED. Since 2.56.0 the status is
// 403 for records, but still 400 for settings such as webhooks and API keys (finding #65);
// only the tests of that status check it, so the other tests keep working once it is fixed.

const PermissionDenied = RestErrorBody.extend({ code: z.literal('PERMISSION_DENIED') });

/** Checks that a REST call was refused for lack of permission, and returns its message. */
export async function expectDenied(response: APIResponse): Promise<string> {
  expect(response.ok(), 'the call is refused').toBe(false);
  return PermissionDenied.parse(await response.json()).messages.join(' ');
}

/** Checks that a GraphQL call was refused as FORBIDDEN, and returns its message. */
export async function expectForbidden(call: Promise<unknown>): Promise<string> {
  const error = await call.then(
    () => undefined,
    (refusal: unknown) => refusal,
  );
  expect(error, 'the call is refused').toBeInstanceOf(GraphQLError);
  const { codes, messages } = error as GraphQLError;
  expect(codes).toContain('FORBIDDEN');
  return messages.join(' ');
}
