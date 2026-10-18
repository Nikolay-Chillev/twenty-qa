import { randomUUID } from 'node:crypto';

import { expect } from '@playwright/test';

import type { Email, Mailpit } from './mailpit';

/** A fresh address on the reserved example.com domain. */
export const uniqueAddress = (): string => `qa-${randomUUID()}@example.com`;

/** Mailpit's search query for emails to `address`, optionally with `subject` in the subject. */
export function searchQuery(address: string, subject?: string): string {
  return subject ? `to:"${address}" subject:"${subject}"` : `to:"${address}"`;
}

/**
 * A unique address for one test, and a way to wait for the emails sent to it.
 * Searching by a unique recipient keeps parallel tests out of each other's mail.
 */
export class Mailbox {
  constructor(
    private readonly mailpit: Mailpit,
    readonly address: string = uniqueAddress(),
  ) {}

  /** The newest email to this address, once it arrives. */
  async waitForEmail(options: { subject?: string; timeout?: number } = {}): Promise<Email> {
    const query = searchQuery(this.address, options.subject);
    let id: string | undefined;
    await expect
      .poll(
        async () => {
          id = (await this.mailpit.search(query))[0]?.ID;
          return id;
        },
        { message: `an email matching ${query}`, timeout: options.timeout ?? 15_000 },
      )
      .toBeDefined();
    if (id === undefined) throw new Error(`No email matching ${query}`);
    return this.mailpit.message(id);
  }
}
