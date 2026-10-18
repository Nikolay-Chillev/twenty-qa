import { existsSync, readFileSync } from 'node:fs';
import { isIP } from 'node:net';
import path from 'node:path';
import { parseEnv } from 'node:util';

import { z } from 'zod';

// A bare z.url() also accepts "localhost:8026", reading "localhost:" as the scheme.
const httpUrl = () => z.url({ protocol: /^https?$/ });

const isIpHost = (url: string): boolean =>
  isIP(new URL(url).hostname.replace(/^\[|\]$/g, '')) !== 0;

const Environment = z.object({
  // Workspaces live on subdomains of this host, which an IP address cannot have.
  TWENTY_URL: httpUrl()
    .refine((url) => !isIpHost(url), {
      error:
        'use a host name such as localhost, not an IP address: workspaces live on its subdomains',
    })
    .default('http://localhost:3000'),
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
  const hostname = `${subdomain}.${url.hostname}`;
  url.hostname = hostname;
  // URL ignores a host name it cannot use (e.g. "qa.127.0.0.1") instead of failing.
  if (url.hostname !== hostname) {
    throw new Error(`Cannot put a workspace on a subdomain of ${serverUrl}`);
  }
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
