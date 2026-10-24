import type { APIRequestContext } from '@playwright/test';
import { z } from 'zod';

import { graphql } from '../api/graphql';

// Invitations and memberships through the /metadata API, as the members settings page
// makes them. Sending, listing and removing invitations takes an admin's access token.

export const Invitation = z.object({
  id: z.string(),
  email: z.string(),
  roleId: z.string().nullable(),
  expiresAt: z.iso.datetime(),
});
export type Invitation = z.infer<typeof Invitation>;

/** Sends invitation emails, as "Invite by email" does; the default role when none is given. */
export async function sendInvitations(
  request: APIRequestContext,
  token: string,
  emails: string[],
): Promise<void> {
  await graphql(request, '/metadata', {
    query: 'mutation($emails: [String!]!) { sendInvitations(emails: $emails) { success } }',
    variables: { emails },
    token,
    data: z.object({ sendInvitations: z.object({ success: z.literal(true) }) }),
  });
}

/** The invitations that are still pending. */
export async function listInvitations(
  request: APIRequestContext,
  token: string,
): Promise<Invitation[]> {
  const data = await graphql(request, '/metadata', {
    query: '{ findWorkspaceInvitations { id email roleId expiresAt } }',
    token,
    data: z.object({ findWorkspaceInvitations: z.array(Invitation) }),
  });
  return data.findWorkspaceInvitations;
}

export async function removeInvitation(
  request: APIRequestContext,
  token: string,
  id: string,
): Promise<void> {
  await graphql(request, '/metadata', {
    query: 'mutation($id: String!) { deleteWorkspaceInvitation(appTokenId: $id) }',
    variables: { id },
    token,
    data: z.object({ deleteWorkspaceInvitation: z.string() }),
  });
}

/** The workspace member with this email, and the label of their role, if they are one. */
export async function membershipOf(
  request: APIRequestContext,
  token: string,
  email: string,
): Promise<{ memberId: string; role: string } | undefined> {
  const data = await graphql(request, '/metadata', {
    query: '{ getRoles { label workspaceMembers { id userEmail } } }',
    token,
    data: z.object({
      getRoles: z.array(
        z.object({
          label: z.string(),
          workspaceMembers: z.array(z.object({ id: z.string(), userEmail: z.string() })),
        }),
      ),
    }),
  });
  for (const role of data.getRoles) {
    const member = role.workspaceMembers.find((one) => one.userEmail === email);
    if (member) return { memberId: member.id, role: role.label };
  }
  return undefined;
}
