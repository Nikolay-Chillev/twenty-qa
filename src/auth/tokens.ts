import type { APIRequestContext } from '@playwright/test';
import { z } from 'zod';

import { graphql } from '../api/graphql';
import { type TestUser, WORKSPACE_URL } from './users';

// The tokens a user gets for the suite's workspace, as the app gets them when signing in,
// and the ways to tamper with one. They are JSON Web Tokens: header, payload and
// signature, each in base64url, joined by dots.

const Token = z.object({ token: z.string() });
const Tokens = z.object({ accessOrWorkspaceAgnosticToken: Token, refreshToken: Token });

export interface TokenPair {
  /** For API calls; valid for 30 minutes. */
  access: string;
  /** For getting a new pair once the access token expires; valid for 60 days. */
  refresh: string;
}

const pairOf = (tokens: z.infer<typeof Tokens>): TokenPair => ({
  access: tokens.accessOrWorkspaceAgnosticToken.token,
  refresh: tokens.refreshToken.token,
});

/**
 * The first step of signing in to the suite's workspace with a password: a short-lived
 * login token, exchanged for the tokens next, with a one-time code if the user has
 * two-factor authentication.
 */
export async function loginTokenFor(
  request: APIRequestContext,
  user: TestUser,
  password: string,
): Promise<string> {
  const { getLoginTokenFromCredentials } = await graphql(request, '/metadata', {
    query: `mutation($email: String!, $password: String!, $origin: String!) {
      getLoginTokenFromCredentials(email: $email, password: $password, origin: $origin) {
        loginToken { token }
      }
    }`,
    variables: { email: user.email, password, origin: WORKSPACE_URL },
    data: z.object({ getLoginTokenFromCredentials: z.object({ loginToken: Token }) }),
  });
  return getLoginTokenFromCredentials.loginToken.token;
}

/** Exchanges a login token for the user's tokens, as for a user without two-factor sign-in. */
export async function tokensFromLoginToken(
  request: APIRequestContext,
  loginToken: string,
): Promise<TokenPair> {
  const { getAuthTokensFromLoginToken } = await graphql(request, '/metadata', {
    query: `mutation($loginToken: String!, $origin: String!) {
      getAuthTokensFromLoginToken(loginToken: $loginToken, origin: $origin) {
        tokens { accessOrWorkspaceAgnosticToken { token } refreshToken { token } }
      }
    }`,
    variables: { loginToken, origin: WORKSPACE_URL },
    data: z.object({ getAuthTokensFromLoginToken: z.object({ tokens: Tokens }) }),
  });
  return pairOf(getAuthTokensFromLoginToken.tokens);
}

/** Exchanges a login token and a one-time code for the user's tokens. */
export async function tokensFromCode(
  request: APIRequestContext,
  loginToken: string,
  code: string,
): Promise<TokenPair> {
  const { getAuthTokensFromOTP } = await graphql(request, '/metadata', {
    query: `mutation($loginToken: String!, $otp: String!, $origin: String!) {
      getAuthTokensFromOTP(loginToken: $loginToken, otp: $otp, origin: $origin) {
        tokens { accessOrWorkspaceAgnosticToken { token } refreshToken { token } }
      }
    }`,
    variables: { loginToken, otp: code, origin: WORKSPACE_URL },
    data: z.object({ getAuthTokensFromOTP: z.object({ tokens: Tokens }) }),
  });
  return pairOf(getAuthTokensFromOTP.tokens);
}

/** Signs a user in to the suite's workspace with a password and returns their tokens. */
export async function signInForTokens(
  request: APIRequestContext,
  user: TestUser,
  password: string,
): Promise<TokenPair> {
  return tokensFromLoginToken(request, await loginTokenFor(request, user, password));
}

/** Exchanges a refresh token for a new pair, as the app does when its access token expires. */
export async function renewTokens(
  request: APIRequestContext,
  refreshToken: string,
): Promise<TokenPair> {
  const { renewToken } = await graphql(request, '/metadata', {
    query: `mutation($appToken: String!) {
      renewToken(appToken: $appToken) {
        tokens { accessOrWorkspaceAgnosticToken { token } refreshToken { token } }
      }
    }`,
    variables: { appToken: refreshToken },
    data: z.object({ renewToken: z.object({ tokens: Tokens }) }),
  });
  return pairOf(renewToken.tokens);
}

/**
 * The token with one character of its signature changed: the first, as the last one may
 * carry bits that decoding drops.
 */
export function withBrokenSignature(token: string): string {
  const [header, payload, signature = ''] = token.split('.');
  const first = signature.startsWith('A') ? 'B' : 'A';
  return `${header ?? ''}.${payload ?? ''}.${first}${signature.slice(1)}`;
}

/** The token with its payload changed, e.g. to another workspace, and its old signature. */
export function withPayload(token: string, changes: Record<string, unknown>): string {
  const [header, payload = '', signature] = token.split('.');
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as object;
  const changed = Buffer.from(JSON.stringify({ ...claims, ...changes })).toString('base64url');
  return `${header ?? ''}.${changed}.${signature ?? ''}`;
}
