import type { APIRequestContext } from '@playwright/test';
import { z } from 'zod';

import { graphql } from '../api/graphql';
import { signInForTokens } from './tokens';
import { base32Bytes, previousStepCode, secretOf } from './totp';
import type { TestUser } from './users';

// Two-factor sign-in with an authenticator app, set up as the profile's "Authenticator
// app" page does it: Twenty hands out a secret, and the first code made from it turns
// two-factor sign-in on. Since 2.58 it also hands out ten backup codes, each of which
// signs in once instead of a code from the app.

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

/**
 * Finishes the setup with a code from the app; from then on signing in asks for a code.
 * Returns the backup codes.
 */
export async function confirmTwoFactorSetup(
  request: APIRequestContext,
  accessToken: string,
  code: string,
): Promise<string[]> {
  const { verifyTwoFactorAuthenticationMethodForAuthenticatedUser: verified } = await graphql(
    request,
    '/metadata',
    {
      query: `mutation($otp: String!) {
        verifyTwoFactorAuthenticationMethodForAuthenticatedUser(otp: $otp) {
          success
          backupCodes
        }
      }`,
      variables: { otp: code },
      token: accessToken,
      data: z.object({
        verifyTwoFactorAuthenticationMethodForAuthenticatedUser: z.object({
          success: z.literal(true),
          backupCodes: z.array(z.string()),
        }),
      }),
    },
  );
  return verified.backupCodes;
}

/** How many of the signed-in user's backup codes are left unused. */
export async function backupCodesLeft(
  request: APIRequestContext,
  accessToken: string,
): Promise<number> {
  const { twoFactorAuthenticationBackupCodeStatus } = await graphql(request, '/metadata', {
    query: '{ twoFactorAuthenticationBackupCodeStatus { remainingBackupCodeCount } }',
    token: accessToken,
    data: z.object({
      twoFactorAuthenticationBackupCodeStatus: z.object({ remainingBackupCodeCount: z.number() }),
    }),
  });
  return twoFactorAuthenticationBackupCodeStatus.remainingBackupCodeCount;
}

/**
 * Replaces the signed-in user's backup codes with ten new ones, as "Generate new codes"
 * on the profile does; it takes a code from the app.
 */
export async function newBackupCodes(
  request: APIRequestContext,
  accessToken: string,
  code?: string,
): Promise<string[]> {
  const { generateTwoFactorAuthenticationBackupCodes } = await graphql(request, '/metadata', {
    query: `mutation($otp: String) {
      generateTwoFactorAuthenticationBackupCodes(otp: $otp) { backupCodes }
    }`,
    variables: { otp: code },
    token: accessToken,
    data: z.object({
      generateTwoFactorAuthenticationBackupCodes: z.object({ backupCodes: z.array(z.string()) }),
    }),
  });
  return generateTwoFactorAuthenticationBackupCodes.backupCodes;
}

/** A member's two-factor sign-in: the key of their authenticator app, and backup codes. */
export interface TwoFactor {
  key: Buffer;
  backupCodes: string[];
}

/**
 * Turns on two-factor sign-in for a member. The setup takes the previous step's code, so
 * the current code is new to Twenty when the test signs in with it.
 */
export async function turnOnTwoFactor(
  request: APIRequestContext,
  member: TestUser,
  password: string,
): Promise<TwoFactor> {
  const { access } = await signInForTokens(request, member, password);
  const key = base32Bytes(await startTwoFactorSetup(request, access));
  const backupCodes = await confirmTwoFactorSetup(request, access, await previousStepCode(key));
  return { key, backupCodes };
}
