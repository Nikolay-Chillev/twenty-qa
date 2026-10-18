import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { APIRequestContext } from '@playwright/test';
import { z } from 'zod';

import { graphql } from '../api/graphql';
import {
  type TestUser,
  USERS,
  WORKSPACE_NAME,
  WORKSPACE_SUBDOMAIN,
  WORKSPACE_URL,
  workspaceFile,
} from './users';

// Twenty has no seed command in production mode, so the workspace and its users are
// created the way the app itself does it, through the /metadata GraphQL API.

const Token = z.object({ token: z.string() });
const TokenPair = z.object({ accessOrWorkspaceAgnosticToken: Token });

const CurrentUser = z.object({
  onboardingStatus: z.string(),
  workspaceMember: z.object({ id: z.string() }).nullable(),
  currentWorkspace: z.object({
    id: z.string(),
    activationStatus: z.string(),
    inviteHash: z.string().nullable(),
  }),
});
type CurrentUser = z.infer<typeof CurrentUser>;

export const SavedWorkspace = z.object({ id: z.uuid(), apiKey: z.string() });
export type SavedWorkspace = z.infer<typeof SavedWorkspace>;

async function userExists(request: APIRequestContext, email: string): Promise<boolean> {
  const data = await graphql(request, '/metadata', {
    query: 'query($email: String!) { checkUserExists(email: $email) { exists } }',
    variables: { email },
    data: z.object({ checkUserExists: z.object({ exists: z.boolean() }) }),
  });
  return data.checkUserExists.exists;
}

/** Signs in with a password and returns a login token for the suite's workspace, if a member. */
async function signIn(request: APIRequestContext, user: TestUser, password: string) {
  const data = await graphql(request, '/metadata', {
    query: `mutation($email: String!, $password: String!) {
      signIn(email: $email, password: $password) {
        tokens { accessOrWorkspaceAgnosticToken { token } }
        availableWorkspaces {
          availableWorkspacesForSignIn { loginToken workspaceUrls { subdomainUrl } }
        }
      }
    }`,
    variables: { email: user.email, password },
    data: z.object({
      signIn: z.object({
        tokens: TokenPair,
        availableWorkspaces: z.object({
          availableWorkspacesForSignIn: z.array(
            z.object({
              loginToken: z.string().nullable(),
              workspaceUrls: z.object({ subdomainUrl: z.url() }),
            }),
          ),
        }),
      }),
    }),
  });
  return {
    workspaceAgnosticToken: data.signIn.tokens.accessOrWorkspaceAgnosticToken.token,
    loginToken: data.signIn.availableWorkspaces.availableWorkspacesForSignIn.find(
      (workspace) => new URL(workspace.workspaceUrls.subdomainUrl).origin === WORKSPACE_URL,
    )?.loginToken,
  };
}

/** Exchanges a login token for an access token; Twenty only accepts the workspace's own address as the origin. */
async function accessTokenFrom(request: APIRequestContext, loginToken: string): Promise<string> {
  const data = await graphql(request, '/metadata', {
    query: `mutation($loginToken: String!, $origin: String!) {
      getAuthTokensFromLoginToken(loginToken: $loginToken, origin: $origin) {
        tokens { accessOrWorkspaceAgnosticToken { token } }
      }
    }`,
    variables: { loginToken, origin: WORKSPACE_URL },
    data: z.object({ getAuthTokensFromLoginToken: z.object({ tokens: TokenPair }) }),
  });
  return data.getAuthTokensFromLoginToken.tokens.accessOrWorkspaceAgnosticToken.token;
}

async function currentUser(request: APIRequestContext, token: string): Promise<CurrentUser> {
  const data = await graphql(request, '/metadata', {
    query: `{ currentUser {
      onboardingStatus
      workspaceMember { id }
      currentWorkspace { id activationStatus inviteHash }
    } }`,
    token,
    data: z.object({ currentUser: CurrentUser }),
  });
  return data.currentUser;
}

/** Walks the user through onboarding, so the app opens on the workspace, not on a form. */
async function completeOnboarding(
  request: APIRequestContext,
  token: string,
  user: TestUser,
): Promise<void> {
  for (let step = 0; step < 5; step++) {
    const me = await currentUser(request, token);
    switch (me.onboardingStatus) {
      case 'COMPLETED':
        return;
      case 'PROFILE_CREATION':
        await graphql(request, '/metadata', {
          query: `mutation($input: UpdateWorkspaceMemberSettingsInput!) {
            updateWorkspaceMemberSettings(input: $input)
          }`,
          variables: {
            input: {
              workspaceMemberId: me.workspaceMember?.id,
              update: { name: { firstName: user.firstName, lastName: user.lastName } },
            },
          },
          token,
          data: z.object({ updateWorkspaceMemberSettings: z.unknown() }),
        });
        break;
      case 'SYNC_EMAIL':
        await graphql(request, '/metadata', {
          query: 'mutation { skipSyncEmailOnboardingStep(isAutoSkipped: false) { success } }',
          token,
          data: z.object({ skipSyncEmailOnboardingStep: z.object({ success: z.boolean() }) }),
        });
        break;
      case 'INVITE_TEAM':
        // The app's "Skip" button sends an empty list of invitations.
        await graphql(request, '/metadata', {
          query: 'mutation { sendInvitations(emails: []) { success } }',
          token,
          data: z.object({ sendInvitations: z.object({ success: z.boolean() }) }),
        });
        break;
      default:
        throw new Error(`${user.email}: unexpected onboarding step ${me.onboardingStatus}`);
    }
  }
  throw new Error(`${user.email}: onboarding did not complete`);
}

/** Signs in the admin, creating the user and the workspace on a fresh environment. */
export async function signInAdmin(request: APIRequestContext, password: string): Promise<string> {
  const admin = USERS.admin;
  let loginToken: string | null | undefined;
  let workspaceAgnosticToken: string;

  if (await userExists(request, admin.email)) {
    ({ loginToken, workspaceAgnosticToken } = await signIn(request, admin, password));
  } else {
    const data = await graphql(request, '/metadata', {
      query: `mutation($email: String!, $password: String!) {
        signUp(email: $email, password: $password) {
          tokens { accessOrWorkspaceAgnosticToken { token } }
        }
      }`,
      variables: { email: admin.email, password },
      data: z.object({ signUp: z.object({ tokens: TokenPair }) }),
    });
    workspaceAgnosticToken = data.signUp.tokens.accessOrWorkspaceAgnosticToken.token;
  }

  if (!loginToken) {
    // The schema marks displayName as optional, but the server requires it.
    const data = await graphql(request, '/metadata', {
      query: `mutation($input: SignUpInNewWorkspaceInput) {
        signUpInNewWorkspace(input: $input) { loginToken { token } }
      }`,
      variables: { input: { displayName: WORKSPACE_NAME, subdomain: WORKSPACE_SUBDOMAIN } },
      token: workspaceAgnosticToken,
      data: z.object({ signUpInNewWorkspace: z.object({ loginToken: Token }) }),
    });
    loginToken = data.signUpInNewWorkspace.loginToken.token;
  }

  const token = await accessTokenFrom(request, loginToken);
  const me = await currentUser(request, token);
  if (me.currentWorkspace.activationStatus !== 'ACTIVE') {
    await graphql(request, '/metadata', {
      query: `mutation($input: ActivateWorkspaceInput!) { activateWorkspace(data: $input) { id } }`,
      variables: { input: { displayName: WORKSPACE_NAME } },
      token,
      data: z.object({ activateWorkspace: z.object({ id: z.string() }) }),
    });
  }
  await completeOnboarding(request, token, admin);
  return token;
}

/** Signs in a member, joining the workspace through its invite link when not yet in it. */
export async function signInMember(
  request: APIRequestContext,
  password: string,
  adminToken: string,
  member: TestUser = USERS.member,
): Promise<string> {
  let loginToken = (await userExists(request, member.email))
    ? (await signIn(request, member, password)).loginToken
    : undefined;

  if (!loginToken) {
    // New users, and users of another workspace (e.g. from an environment created
    // before it ran with multiple workspaces), join through the invite link; an
    // existing user proves it with their password.
    const workspace = (await currentUser(request, adminToken)).currentWorkspace;
    const data = await graphql(request, '/metadata', {
      query: `mutation($email: String!, $password: String!, $workspaceId: UUID, $workspaceInviteHash: String) {
        signUpInWorkspace(email: $email, password: $password, workspaceId: $workspaceId,
                          workspaceInviteHash: $workspaceInviteHash) {
          loginToken { token }
        }
      }`,
      variables: {
        email: member.email,
        password,
        workspaceId: workspace.id,
        workspaceInviteHash: workspace.inviteHash,
      },
      data: z.object({ signUpInWorkspace: z.object({ loginToken: Token }) }),
    });
    loginToken = data.signUpInWorkspace.loginToken.token;
  }

  const token = await accessTokenFrom(request, loginToken);
  await completeOnboarding(request, token, member);
  return token;
}

/** Reuses the saved API key while it still works, otherwise creates one with the Admin role. */
export async function apiKeyFor(
  request: APIRequestContext,
  adminToken: string,
  saved: string | undefined,
): Promise<string> {
  if (saved) {
    const probe = await request.get('/rest/companies?limit=1', {
      headers: { Authorization: `Bearer ${saved}` },
    });
    if (probe.ok()) return saved;
  }

  const { getRoles } = await graphql(request, '/metadata', {
    query: '{ getRoles { id label } }',
    token: adminToken,
    data: z.object({ getRoles: z.array(z.object({ id: z.string(), label: z.string() })) }),
  });
  const adminRole = getRoles.find((role) => role.label === 'Admin');
  if (!adminRole) throw new Error('The workspace has no Admin role');

  const expiresAt = '2099-12-31T00:00:00.000Z';
  const { createApiKey } = await graphql(request, '/metadata', {
    query: 'mutation($input: CreateApiKeyInput!) { createApiKey(input: $input) { id } }',
    variables: { input: { name: 'twenty-qa', expiresAt, roleId: adminRole.id } },
    token: adminToken,
    data: z.object({ createApiKey: z.object({ id: z.string() }) }),
  });
  const { generateApiKeyToken } = await graphql(request, '/metadata', {
    query: `mutation($apiKeyId: UUID!, $expiresAt: String!) {
      generateApiKeyToken(apiKeyId: $apiKeyId, expiresAt: $expiresAt) { token }
    }`,
    variables: { apiKeyId: createApiKey.id, expiresAt },
    token: adminToken,
    data: z.object({ generateApiKeyToken: Token }),
  });
  return generateApiKeyToken.token;
}

export async function workspaceIdOf(request: APIRequestContext, token: string): Promise<string> {
  return (await currentUser(request, token)).currentWorkspace.id;
}

export function readSavedWorkspace(): SavedWorkspace | undefined {
  if (!existsSync(workspaceFile)) return undefined;
  const parsed = SavedWorkspace.safeParse(JSON.parse(readFileSync(workspaceFile, 'utf8')));
  return parsed.success ? parsed.data : undefined;
}

export function saveWorkspace(workspace: SavedWorkspace): void {
  mkdirSync(path.dirname(workspaceFile), { recursive: true });
  writeFileSync(workspaceFile, JSON.stringify(workspace, null, 2));
}
