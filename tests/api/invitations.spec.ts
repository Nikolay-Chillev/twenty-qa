import { GraphQLError } from '../../src/api/graphql';
import { listInvitations, removeInvitation, sendInvitations } from '../../src/auth/invitations';
import { signInMember } from '../../src/auth/workspace';
import { expect, test } from '../../src/fixtures';
import { linkIn, uniqueAddress } from '../../src/mail/mailbox';

test.describe('invitations', () => {
  test(
    "an admin's invitation is emailed, listed for 30 days and can be removed",
    { tag: '@email' },
    async ({ request, adminToken, invitee }) => {
      await sendInvitations(request, adminToken, [invitee.address]);

      const email = await invitee.waitForEmail({ subject: 'Join your team on Twenty' });
      expect(linkIn(email, '/invite/')).toContain(`email=${encodeURIComponent(invitee.address)}`);
      const sent = (await listInvitations(request, adminToken)).find(
        (one) => one.email === invitee.address,
      );
      expect(sent).toBeDefined();
      const days = (Date.parse(sent?.expiresAt ?? '') - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(29);
      expect(days).toBeLessThanOrEqual(30);

      await removeInvitation(request, adminToken, sent?.id ?? '');

      const pending = await listInvitations(request, adminToken);
      expect(pending.map((one) => one.email)).not.toContain(invitee.address);
    },
  );

  test('a member may not send invitations', async ({
    request,
    adminToken,
    password,
    newMember,
  }) => {
    const memberToken = await signInMember(request, password, adminToken, newMember);
    const address = uniqueAddress();

    const refusal = await sendInvitations(request, memberToken, [address]).catch(
      (error: unknown) => error,
    );

    expect(refusal).toBeInstanceOf(GraphQLError);
    expect((refusal as GraphQLError).codes).toContain('FORBIDDEN');
    const pending = await listInvitations(request, adminToken);
    expect(pending.map((one) => one.email)).not.toContain(address);
  });
});
