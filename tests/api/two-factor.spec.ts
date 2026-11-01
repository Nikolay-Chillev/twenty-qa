import { GraphQLError } from '../../src/api/graphql';
import {
  loginTokenFor,
  signInForTokens,
  tokensFromCode,
  tokensFromLoginToken,
} from '../../src/auth/tokens';
import { base32Bytes, totpCode } from '../../src/auth/totp';
import {
  confirmTwoFactorSetup,
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
    const key = await turnOnTwoFactor(request, newMember, password);
    const loginToken = await loginTokenFor(request, newMember, password);

    const { access } = await tokensFromCode(request, loginToken, totpCode(key));

    const response = await apiFor(request, access).rest.send('GET', '/rest/companies', {
      params: { limit: 1 },
    });
    expect(response.status()).toBe(200);
  });

  test.fail(
    'a code that was used once is refused the second time',
    { annotation: { type: 'issue', description: `${ISSUES}/74` } },
    async ({ request, newMember, password }) => {
      const key = await turnOnTwoFactor(request, newMember, password);
      const code = totpCode(key);
      await tokensFromCode(request, await loginTokenFor(request, newMember, password), code);

      const again = await failure(
        tokensFromCode(request, await loginTokenFor(request, newMember, password), code),
      );

      expect(again.messages).toEqual(['Invalid OTP']);
    },
  );
});
