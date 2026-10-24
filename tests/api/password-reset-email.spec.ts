import { requestPasswordReset } from '../../src/auth/password';
import { WORKSPACE_URL } from '../../src/auth/users';
import { expect, test } from '../../src/fixtures';
import { linkIn } from '../../src/mail/mailbox';

test(
  'a password reset email arrives with a link back to Twenty',
  { tag: ['@smoke', '@email'] },
  async ({ request, mailbox, newMember }) => {
    await requestPasswordReset(request, newMember.email);
    const email = await mailbox.waitForEmail({ subject: 'Reset Password' });

    expect(email.Subject).toBe('Action Needed to Reset Password');
    expect(linkIn(email, '/reset-password/')).toMatch(
      new RegExp(`^${WORKSPACE_URL}/reset-password/[0-9a-f]{64}$`),
    );
  },
);
