import type { APIRequestContext } from '@playwright/test';
import { z } from 'zod';

const Address = z.object({ Name: z.string(), Address: z.string() });

const Summary = z.object({
  ID: z.string(),
  Subject: z.string(),
  To: z.array(Address),
  Created: z.iso.datetime({ offset: true }),
});
export type EmailSummary = z.infer<typeof Summary>;

export const Email = z.object({
  ID: z.string(),
  Subject: z.string(),
  From: Address,
  To: z.array(Address),
  Text: z.string(),
  HTML: z.string(),
});
export type Email = z.infer<typeof Email>;

/**
 * Reads the emails Mailpit caught, through Playwright's request context so the calls
 * show up in traces next to the API calls that sent the emails.
 */
export class Mailpit {
  constructor(
    private readonly request: APIRequestContext,
    private readonly baseUrl: string,
  ) {}

  /** Emails matching Mailpit's search syntax, newest first. */
  async search(query: string): Promise<EmailSummary[]> {
    const response = await this.request.get(new URL('/api/v1/search', this.baseUrl).href, {
      params: { query },
    });
    if (!response.ok()) throw new Error(`Mailpit search answered ${String(response.status())}`);
    return z.object({ messages: z.array(Summary) }).parse(await response.json()).messages;
  }

  async message(id: string): Promise<Email> {
    const response = await this.request.get(new URL(`/api/v1/message/${id}`, this.baseUrl).href);
    if (!response.ok()) throw new Error(`Mailpit message answered ${String(response.status())}`);
    return Email.parse(await response.json());
  }
}
