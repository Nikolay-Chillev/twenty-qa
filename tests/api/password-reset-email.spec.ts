import { z } from 'zod';

import { graphql } from '../../src/api/graphql';
import type { TestUser } from '../../src/auth/users';
import { signInMember } from '../../src/auth/workspace';
import { config } from '../../src/config';
import { expect, test } from '../../src/fixtures';

test(
  'a password reset email arrives with a link back to Twenty',
  { tag: ['@smoke', '@email'] },
  async ({ request, mailbox, adminToken, password }) => {
    const user: TestUser = {
      role: 'member',
      email: mailbox.address,
      firstName: 'Елена',
      lastName: 'Димитрова',
    };
    await signInMember(request, password, adminToken, user);

    await graphql(request, '/metadata', {
      query: 'mutation($email: String!) { emailPasswordResetLink(email: $email) { success } }',
      variables: { email: user.email },
      data: z.object({ emailPasswordResetLink: z.object({ success: z.literal(true) }) }),
    });
    const email = await mailbox.waitForEmail({ subject: 'Reset Password' });

    expect(email.Subject).toBe('Action Needed to Reset Password');
    expect(email.Text).toContain(`${config.TWENTY_URL}/reset-password/`);
  },
);
