import { expect, test } from '@playwright/test';

import { base32Bytes, secretOf, totpCode } from '../../src/auth/totp';

// The SHA-1 test values of RFC 6238, appendix B: the key "12345678901234567890".
const RFC_KEY = Buffer.from('12345678901234567890');

test.describe('one-time codes', () => {
  test('match the test values of RFC 6238', () => {
    const codes = [59, 1_111_111_109, 1_111_111_111, 1_234_567_890, 2_000_000_000].map((seconds) =>
      totpCode(RFC_KEY, new Date(seconds * 1000), 8),
    );

    expect(codes).toEqual(['94287082', '07081804', '14050471', '89005924', '69279037']);
  });

  test('read a base32 secret as authenticator apps do', () => {
    expect(base32Bytes('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')).toEqual(RFC_KEY);
    expect(base32Bytes('gezdgnbvgy3tqojq')).toEqual(Buffer.from('1234567890'));
  });

  test('take the secret from an otpauth URI', () => {
    const uri = 'otpauth://totp/Twenty%20-%20QA:a%40example.com?secret=GEZDGNBV&period=30&digits=6';

    expect(secretOf(uri)).toBe('GEZDGNBV');
  });
});
