import { expect, test } from '@playwright/test';

import { mergeEnvironment, parseConfig } from '../../src/config';

test.describe('test environment settings', () => {
  test('default to the local Docker environment', () => {
    expect(parseConfig({})).toEqual({
      TWENTY_URL: 'http://localhost:3000',
      MAILPIT_URL: 'http://localhost:8026',
    });
  });

  test('take URLs from the environment', () => {
    const config = parseConfig({ TWENTY_URL: 'http://127.0.0.1:3100' });

    expect(config.TWENTY_URL).toBe('http://127.0.0.1:3100');
  });

  test('reject a value that is not a URL, naming the variable', () => {
    expect(() => parseConfig({ MAILPIT_URL: 'localhost:8026' })).toThrow(/MAILPIT_URL/);
  });

  test('reject a short password for the test users', () => {
    expect(() => parseConfig({ TWENTY_PASSWORD: 'short' })).toThrow(/TWENTY_PASSWORD/);
  });

  test('read .env, with variables from the process taking precedence', () => {
    const env = mergeEnvironment('TWENTY_PASSWORD=from-file\nMAILPIT_URL=http://file:8026\n', {
      MAILPIT_URL: 'http://process:8026',
    });

    expect(env).toEqual({ TWENTY_PASSWORD: 'from-file', MAILPIT_URL: 'http://process:8026' });
  });
});
