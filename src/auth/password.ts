import type { APIRequestContext } from '@playwright/test';
import { z } from 'zod';

import { graphql } from '../api/graphql';

// Password resets through the /metadata API, as the sign-in page and the reset page
// make them. Neither needs to be signed in.

const Success = z.object({ success: z.literal(true) });

/** Sends the password reset email, as "Forgot your password?" on the sign-in page does. */
export async function requestPasswordReset(
  request: APIRequestContext,
  email: string,
): Promise<void> {
  await graphql(request, '/metadata', {
    query: 'mutation($email: String!) { emailPasswordResetLink(email: $email) { success } }',
    variables: { email },
    data: z.object({ emailPasswordResetLink: Success }),
  });
}

/** Sets a new password with the token from a reset link, as the reset page does. */
export async function resetPassword(
  request: APIRequestContext,
  token: string,
  newPassword: string,
): Promise<void> {
  await graphql(request, '/metadata', {
    query: `mutation($token: String!, $password: String!) {
      updatePasswordViaResetToken(passwordResetToken: $token, newPassword: $password) { success }
    }`,
    variables: { token, password: newPassword },
    data: z.object({ updatePasswordViaResetToken: Success }),
  });
}
