import { createHmac } from 'node:crypto';

// One-time codes as an authenticator app makes them (TOTP, RFC 6238), so a test can sign
// in with two-factor authentication: HMAC-SHA1 of the 30-second step, 6 digits.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** The bytes of a base32 secret, as `otpauth://` URIs carry it. */
export function base32Bytes(secret: string): Buffer {
  let bits = '';
  for (const character of secret.replace(/=+$/, '').toUpperCase()) {
    const value = ALPHABET.indexOf(character);
    if (value < 0) throw new Error(`Not a base32 character: ${character}`);
    bits += value.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let start = 0; start + 8 <= bits.length; start += 8) {
    bytes.push(parseInt(bits.slice(start, start + 8), 2));
  }
  return Buffer.from(bytes);
}

/** The code for a key at a moment, `digits` long. */
export function totpCode(key: Buffer, at: Date = new Date(), digits = 6): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at.getTime() / 30_000)));
  const hmac = createHmac('sha1', key).update(counter).digest();
  const offset = (hmac.at(-1) ?? 0) & 0xf;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return String(code).padStart(digits, '0');
}

/**
 * The code of the previous 30-second step, which Twenty still accepts, so that a later
 * code is new to it. It is made once at least `margin` seconds are left in the current
 * step: sent within that margin, it is still one step behind the server's, not two.
 */
export async function previousStepCode(key: Buffer, margin = 10): Promise<string> {
  const left = 30 - ((Date.now() / 1000) % 30);
  if (left < margin) {
    await new Promise((resolve) => setTimeout(resolve, left * 1000 + 100));
  }
  return totpCode(key, new Date(Date.now() - 30_000));
}

/** The secret of an `otpauth://totp/…?secret=…` URI, as an authenticator app reads it. */
export function secretOf(uri: string): string {
  const secret = new URL(uri).searchParams.get('secret');
  if (!secret) throw new Error('The URI has no secret');
  return secret;
}
