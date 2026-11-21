import { type APIResponse, expect } from '@playwright/test';
import { z } from 'zod';

import { GraphQLError } from './graphql';
import { RestErrorBody } from './rest';

// How Twenty refuses a call for lack of permission. Over GraphQL the error's code is
// FORBIDDEN. Over REST the status is 403 and the body's code PERMISSION_DENIED; the status
// was 400 before 2.56.0 for records and before 2.59.0 for settings (finding #65).

const PermissionDenied = RestErrorBody.extend({ code: z.literal('PERMISSION_DENIED') });

/** Checks that a REST call was refused for lack of permission, and returns its message. */
export async function expectDenied(response: APIResponse): Promise<string> {
  expect(response.status(), 'the call is refused as forbidden').toBe(403);
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
