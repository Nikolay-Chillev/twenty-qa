import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';

import { z } from 'zod';

// A bare z.url() also accepts "localhost:8026", reading "localhost:" as the scheme.
const httpUrl = () => z.url({ protocol: /^https?$/ });

const Environment = z.object({
  TWENTY_URL: httpUrl().default('http://localhost:3000'),
  MAILPIT_URL: httpUrl().default('http://localhost:8026'),
  /** Password of the suite's users; scripts/start.sh generates one into .env. */
  TWENTY_PASSWORD: z.string().min(12).optional(),
});

export type Config = z.infer<typeof Environment>;

/** Reads the settings from environment variables; the defaults match docker-compose.yml. */
export function parseConfig(env: Record<string, string | undefined>): Config {
  const parsed = Environment.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid test environment settings:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

/** A workspace's own address: its subdomain in front of the server's host. */
export function workspaceUrl(serverUrl: string, subdomain: string): string {
  const url = new URL(serverUrl);
  url.hostname = `${subdomain}.${url.hostname}`;
  return url.origin;
}

/** Variables from a .env file, overridden by those set in the process environment. */
export function mergeEnvironment(
  dotenv: string | undefined,
  env: Record<string, string | undefined>,
): Record<string, string | undefined> {
  return { ...(dotenv === undefined ? {} : parseEnv(dotenv)), ...env };
}

const dotenvPath = path.join(__dirname, '..', '.env');

export const config = parseConfig(
  mergeEnvironment(
    existsSync(dotenvPath) ? readFileSync(dotenvPath, 'utf8') : undefined,
    process.env,
  ),
);
