import { expect, test } from '@playwright/test';

import { searchQuery, uniqueAddress } from '../../src/mail/mailbox';

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
});
