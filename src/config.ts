import { z } from 'zod';

// A bare z.url() also accepts "localhost:8026", reading "localhost:" as the scheme.
const httpUrl = () => z.url({ protocol: /^https?$/ });

const Environment = z.object({
  TWENTY_URL: httpUrl().default('http://localhost:3000'),
  MAILPIT_URL: httpUrl().default('http://localhost:8026'),
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

export const config = parseConfig(process.env);
