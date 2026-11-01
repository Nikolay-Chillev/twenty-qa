import type { APIRequestContext } from '@playwright/test';
import { z } from 'zod';

import { graphql } from '../api/graphql';
import { signInForTokens } from './tokens';
import { base32Bytes, previousStepCode, secretOf } from './totp';
import type { TestUser } from './users';

// Two-factor sign-in with an authenticator app, set up as the profile's "Authenticator
// app" page does it: Twenty hands out a secret, and the first code made from it turns
// two-factor sign-in on.

/** Starts setting up an authenticator app for the signed-in user; returns its secret. */
export async function startTwoFactorSetup(
  request: APIRequestContext,
  accessToken: string,
): Promise<string> {
  const { initiateOTPProvisioningForAuthenticatedUser } = await graphql(request, '/metadata', {
    query: 'mutation { initiateOTPProvisioningForAuthenticatedUser { uri } }',
    token: accessToken,
    data: z.object({
      initiateOTPProvisioningForAuthenticatedUser: z.object({ uri: z.string() }),
    }),
  });
  return secretOf(initiateOTPProvisioningForAuthenticatedUser.uri);
}

/** Finishes the setup with a code from the app; from then on signing in asks for a code. */
export async function confirmTwoFactorSetup(
  request: APIRequestContext,
  accessToken: string,
  code: string,
): Promise<void> {
  await graphql(request, '/metadata', {
    query: `mutation($otp: String!) {
      verifyTwoFactorAuthenticationMethodForAuthenticatedUser(otp: $otp) { success }
    }`,
    variables: { otp: code },
    token: accessToken,
    data: z.object({
      verifyTwoFactorAuthenticationMethodForAuthenticatedUser: z.object({
        success: z.literal(true),
      }),
    }),
  });
}

/**
 * Turns on two-factor sign-in for a member; returns the key of their authenticator app.
 * The setup takes the previous step's code, so the current code is new to Twenty when
 * the test signs in with it.
 */
export async function turnOnTwoFactor(
  request: APIRequestContext,
  member: TestUser,
  password: string,
): Promise<Buffer> {
  const { access } = await signInForTokens(request, member, password);
  const key = base32Bytes(await startTwoFactorSetup(request, access));
  await confirmTwoFactorSetup(request, access, await previousStepCode(key));
  return key;
}
