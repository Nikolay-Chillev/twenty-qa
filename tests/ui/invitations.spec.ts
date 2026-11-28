import {
  listInvitations,
  membershipOf,
  removeInvitation,
  sendInvitations,
} from '../../src/auth/invitations';
import { WORKSPACE_NAME, WORKSPACE_URL } from '../../src/auth/users';
import { personName } from '../../src/data/factories';
import { expect, test } from '../../src/fixtures';
import { linkIn } from '../../src/mail/mailbox';
import { MembersSettingsPage } from '../../src/ui/members-settings';
import { Navigation } from '../../src/ui/navigation';
import { PAGE_LOAD } from '../../src/ui/record-table';
import { InvitationPage } from '../../src/ui/sign-in';

const ISSUES = 'https://github.com/Nikolay-Chillev/twenty-qa/issues';
const SUBJECT = 'Join your team on Twenty';

test.describe('invitations', () => {
  test('an invited person joins from the email as a member', async ({
    page,
    guestPage,
    request,
    adminToken,
    invitee,
    password,
  }) => {
    const members = await new MembersSettingsPage(page).open();

    await members.invite(invitee.address);

    await expect(members.pending(invitee.address)).toContainText('Default role');
    const email = await invitee.waitForEmail({ subject: SUBJECT });
    expect(email.Text).toContain(`has invited you to join a workspace called ${WORKSPACE_NAME}`);
    const invitation = await new InvitationPage(guestPage).open(
      linkIn(email, `${WORKSPACE_URL}/welcome?inviteToken=`),
    );
    await expect(invitation.heading(WORKSPACE_NAME)).toBeVisible();
    await expect(invitation.form.email).toHaveValue(invitee.address);
    await invitation.join(password, personName());

    // A new member is welcomed with an animation, which can outlast a page load in a
    // slow browser, before the app opens.
    await expect(
      guestPage
        .getByText('Welcome to your workspace')
        .or(new Navigation(guestPage).workspaceMenu)
        .first(),
    ).toBeVisible({ timeout: PAGE_LOAD });
    await expect
      .poll(async () => (await membershipOf(request, adminToken, invitee.address))?.role)
      .toBe('Member');
    // A used invitation leaves the list of pending ones.
    await page.reload();
    await expect(members.emails).toBeVisible({ timeout: PAGE_LOAD });
    await expect(page.getByText(invitee.address, { exact: true })).toHaveCount(0);
  });

  test('a resent invitation sends the email again', async ({
    page,
    request,
    adminToken,
    invitee,
  }) => {
    await sendInvitations(request, adminToken, [invitee.address]);
    await invitee.waitForEmail({ subject: SUBJECT });
    const members = await new MembersSettingsPage(page).open();

    await members.resend(invitee.address);

    await expect.poll(() => invitee.count({ subject: SUBJECT })).toBe(2);
  });

  test('a removed invitation leaves the list of pending invitations', async ({
    page,
    request,
    adminToken,
    invitee,
  }) => {
    await sendInvitations(request, adminToken, [invitee.address]);
    const members = await new MembersSettingsPage(page).open();
    await expect(members.pending(invitee.address)).toBeVisible();

    await members.remove(invitee.address);

    const pending = await listInvitations(request, adminToken);
    expect(pending.map((one) => one.email)).not.toContain(invitee.address);
  });

  // Before 2.64.1 the email gave the workspace's public invite link, which still let the
  // person in after the invitation was removed (finding #54). It now gives a personal
  // invite token, and signing up with it is refused once the invitation is gone.
  test(
    'the link of a removed invitation no longer lets the person join',
    { annotation: { type: 'issue', description: `${ISSUES}/54` } },
    async ({ guestPage, request, adminToken, invitee, password }) => {
      await sendInvitations(request, adminToken, [invitee.address]);
      const link = linkIn(
        await invitee.waitForEmail({ subject: SUBJECT }),
        '/welcome?inviteToken=',
      );
      const sent = (await listInvitations(request, adminToken)).find(
        (one) => one.email === invitee.address,
      );
      await removeInvitation(request, adminToken, sent?.id ?? '');

      await new InvitationPage(guestPage).tryToJoin(link, password);

      // The link still opens the form; the sign-up is what is refused, and no member is made.
      await expect(
        guestPage
          .getByRole('status')
          .filter({ hasText: 'User does not have access to this workspace' }),
      ).toBeVisible();
      expect(await membershipOf(request, adminToken, invitee.address)).toBeUndefined();
    },
  );
});
