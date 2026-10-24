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
      linkIn(email, `${WORKSPACE_URL}/invite/`),
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

  // While the workspace's invite link is on, as it is by default, the link in the email
  // still lets the person in after the invitation is removed.
  test.fail(
    'the link of a removed invitation no longer lets the person join',
    { annotation: { type: 'issue', description: `${ISSUES}/54` } },
    async ({ guestPage, request, adminToken, invitee, password }) => {
      await sendInvitations(request, adminToken, [invitee.address]);
      const link = linkIn(await invitee.waitForEmail({ subject: SUBJECT }), '/invite/');
      const sent = (await listInvitations(request, adminToken)).find(
        (one) => one.email === invitee.address,
      );
      await removeInvitation(request, adminToken, sent?.id ?? '');

      // A refusal may come at the link or at sign-up; either way, no member is made.
      await new InvitationPage(guestPage).tryToJoin(link, password);

      expect(await membershipOf(request, adminToken, invitee.address)).toBeUndefined();
    },
  );
});
