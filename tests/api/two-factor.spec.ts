import { GraphQLError } from '../../src/api/graphql';
import {
  loginTokenFor,
  signInForTokens,
  tokensFromBackupCode,
  tokensFromCode,
  tokensFromLoginToken,
} from '../../src/auth/tokens';
import { base32Bytes, totpCode } from '../../src/auth/totp';
import {
  backupCodesLeft,
  confirmTwoFactorSetup,
  newBackupCodes,
  startTwoFactorSetup,
  turnOnTwoFactor,
} from '../../src/auth/two-factor';
import { apiFor, expect, test } from '../../src/fixtures';

const ISSUES = 'https://github.com/Nikolay-Chillev/twenty-qa/issues';

/** The error a call failed with. */
async function failure(call: Promise<unknown>): Promise<GraphQLError> {
  const error = await call.then(
    () => undefined,
    (refusal: unknown) => refusal,
  );
  expect(error, 'the call fails').toBeInstanceOf(GraphQLError);
  return error as GraphQLError;
}

test.describe('two-factor sign-in', () => {
  test('the setup is confirmed only by a code from the app', async ({
    request,
    newMember,
    password,
  }) => {
    const { access } = await signInForTokens(request, newMember, password);
    const key = base32Bytes(await startTwoFactorSetup(request, access));

    const wrong = await failure(confirmTwoFactorSetup(request, access, '000000'));
    await confirmTwoFactorSetup(request, access, totpCode(key));

    expect(wrong.messages).toEqual(['Invalid OTP']);
  });

  test('a password alone gives no tokens, nor does a wrong code', async ({
    request,
    newMember,
    password,
  }) => {
    await turnOnTwoFactor(request, newMember, password);
    const loginToken = await loginTokenFor(request, newMember, password);

    const withoutCode = await failure(tokensFromLoginToken(request, loginToken));
    const wrongCode = await failure(tokensFromCode(request, loginToken, '000000'));

    expect(withoutCode.messages).toEqual(['Two factor authentication verification required']);
    expect(wrongCode.messages).toEqual(['Invalid OTP']);
  });

  test('the password and the code from the app give working tokens', async ({
    request,
    newMember,
    password,
  }) => {
    const { key } = await turnOnTwoFactor(request, newMember, password);
    const loginToken = await loginTokenFor(request, newMember, password);

    const { access } = await tokensFromCode(request, loginToken, totpCode(key));

    const response = await apiFor(request, access).rest.send('GET', '/rest/companies', {
      params: { limit: 1 },
    });
    expect(response.status()).toBe(200);
  });

  test(
    'a code that was used once is refused the second time',
    { annotation: { type: 'issue', description: `${ISSUES}/74` } },
    async ({ request, newMember, password }) => {
      const { key } = await turnOnTwoFactor(request, newMember, password);
      const code = totpCode(key);
      await tokensFromCode(request, await loginTokenFor(request, newMember, password), code);

      const again = await failure(
        tokensFromCode(request, await loginTokenFor(request, newMember, password), code),
      );

      expect(again.messages).toEqual(['Invalid OTP']);
    },
  );
});

test.describe('backup codes', () => {
  // A member may try 5 codes in 15 minutes, right or wrong. Each test has a member of its
  // own, and only the test of that limit goes past it.
  const WRONG_CODE = 'AAAAA-BBBBB-CCCCC-DDDDD';

  test('ten come with the setup, each different, in four groups of five', async ({
    request,
    newMember,
    password,
  }) => {
    const { backupCodes } = await turnOnTwoFactor(request, newMember, password);

    expect(backupCodes).toHaveLength(10);
    expect(new Set(backupCodes).size).toBe(10);
    for (const code of backupCodes) expect(code).toMatch(/^[0-9A-Z]{5}(-[0-9A-Z]{5}){3}$/);
  });

  test('one signs the member in once, and one fewer is left', async ({
    request,
    newMember,
    password,
    mailbox,
  }) => {
    const {
      backupCodes: [code = ''],
    } = await turnOnTwoFactor(request, newMember, password);

    const { access } = await tokensFromBackupCode(
      request,
      await loginTokenFor(request, newMember, password),
      code,
    );

    const response = await apiFor(request, access).rest.send('GET', '/rest/companies', {
      params: { limit: 1 },
    });
    expect(response.status()).toBe(200);
    expect(await backupCodesLeft(request, access)).toBe(9);
    // The member hears of it, in case it was not them.
    await mailbox.waitForEmail({ subject: 'A backup code was used to sign in to your account' });
    const again = await failure(
      tokensFromBackupCode(request, await loginTokenFor(request, newMember, password), code),
    );
    expect(again.messages).toEqual(['Invalid recovery code']);
  });

  test('one typed in lower case and without dashes works too', async ({
    request,
    newMember,
    password,
  }) => {
    const {
      backupCodes: [code = ''],
    } = await turnOnTwoFactor(request, newMember, password);

    const { access } = await tokensFromBackupCode(
      request,
      await loginTokenFor(request, newMember, password),
      code.toLowerCase().replaceAll('-', ''),
    );

    expect(await backupCodesLeft(request, access)).toBe(9);
  });

  test('one sent twice at the same moment signs in only once', async ({
    request,
    newMember,
    password,
  }) => {
    const {
      backupCodes: [code = ''],
    } = await turnOnTwoFactor(request, newMember, password);
    const loginTokens = await Promise.all([
      loginTokenFor(request, newMember, password),
      loginTokenFor(request, newMember, password),
    ]);

    const results = await Promise.allSettled(
      loginTokens.map((loginToken) => tokensFromBackupCode(request, loginToken, code)),
    );

    expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
  });

  test("one member's code does not sign in another", async ({
    request,
    newMember,
    secondMember,
    password,
  }) => {
    const {
      backupCodes: [code = ''],
    } = await turnOnTwoFactor(request, newMember, password);
    await turnOnTwoFactor(request, secondMember, password);

    const refusal = await failure(
      tokensFromBackupCode(request, await loginTokenFor(request, secondMember, password), code),
    );

    expect(refusal.messages).toEqual(['Invalid recovery code']);
    // The code still works for its owner.
    await tokensFromBackupCode(request, await loginTokenFor(request, newMember, password), code);
  });

  test('new ones take a code from the app, and replace the old ones', async ({
    request,
    newMember,
    password,
    mailbox,
  }) => {
    const { access } = await signInForTokens(request, newMember, password);
    const {
      key,
      backupCodes: [old = ''],
    } = await turnOnTwoFactor(request, newMember, password);

    const refusal = await failure(newBackupCodes(request, access));
    expect(refusal.messages).toEqual([
      'A two-factor authentication code is required for this action',
    ]);
    const [fresh = ''] = await newBackupCodes(request, access, totpCode(key));

    await mailbox.waitForEmail({ subject: 'New backup codes were generated for your account' });
    const stale = await failure(
      tokensFromBackupCode(request, await loginTokenFor(request, newMember, password), old),
    );
    expect(stale.messages).toEqual(['Invalid recovery code']);
    await tokensFromBackupCode(request, await loginTokenFor(request, newMember, password), fresh);
  });

  test('after five tries in 15 minutes, even a right one is refused', async ({
    request,
    newMember,
    password,
  }) => {
    const {
      backupCodes: [code = ''],
    } = await turnOnTwoFactor(request, newMember, password);
    for (let attempt = 1; attempt <= 5; attempt++) {
      await failure(
        tokensFromBackupCode(
          request,
          await loginTokenFor(request, newMember, password),
          WRONG_CODE,
        ),
      );
    }

    const refusal = await failure(
      tokensFromBackupCode(request, await loginTokenFor(request, newMember, password), code),
    );

    expect(refusal.messages.join(' ')).toContain('Limit reached');
  });
});
