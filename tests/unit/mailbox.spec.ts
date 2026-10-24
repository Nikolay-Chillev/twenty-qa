import { expect, test } from '@playwright/test';

import { linkIn, searchQuery, uniqueAddress } from '../../src/mail/mailbox';

test.describe('mailbox', () => {
  test('gives every test its own address', () => {
    const first = uniqueAddress();
    const second = uniqueAddress();

    expect(first).toMatch(/^qa-[0-9a-f-]{36}@example\.com$/);
    expect(second).not.toBe(first);
  });

  test('searches by recipient, and by subject when given', () => {
    expect(searchQuery('a@example.com')).toBe('to:"a@example.com"');
    expect(searchQuery('a@example.com', 'Reset Password')).toBe(
      'to:"a@example.com" subject:"Reset Password"',
    );
  });

  test('finds the link to a path in an email, or says it is missing', () => {
    const email = {
      Subject: 'Reset Password',
      Text: [
        'Use this link:',
        'http://qa.localhost:3000/reset-password/abc123',
        '',
        'Website https://twenty.com/',
      ].join('\r\n'),
    };

    expect(linkIn(email, '/reset-password/')).toBe(
      'http://qa.localhost:3000/reset-password/abc123',
    );
    expect(() => linkIn(email, '/invite/')).toThrow(
      'No link to /invite/ in the email "Reset Password"',
    );
  });
});
