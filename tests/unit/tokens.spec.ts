import { expect, test } from '@playwright/test';

import { withBrokenSignature, withPayload } from '../../src/auth/tokens';

const encode = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64url');
const decode = (part: string): unknown => JSON.parse(Buffer.from(part, 'base64url').toString());

const header = encode({ alg: 'HS256', typ: 'JWT' });
const token = `${header}.${encode({ workspaceId: 'a', type: 'ACCESS' })}.AbCdEf`;

test.describe('tampering with a token', () => {
  test('a broken signature changes only its first character', () => {
    const broken = withBrokenSignature(token);

    expect(broken).toBe(`${token.slice(0, token.lastIndexOf('.'))}.BbCdEf`);
    expect(withBrokenSignature(broken)).toBe(token);
  });

  test('a changed payload keeps the header, the other claims and the signature', () => {
    const [newHeader, payload = '', signature] = withPayload(token, { workspaceId: 'b' }).split(
      '.',
    );

    expect(newHeader).toBe(header);
    expect(decode(payload)).toEqual({ workspaceId: 'b', type: 'ACCESS' });
    expect(signature).toBe('AbCdEf');
  });
});
