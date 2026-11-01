import { expect, type Page } from '@playwright/test';
import { z } from 'zod';

import { secretOf } from '../auth/totp';
import { PAGE_LOAD } from './record-table';

const Provisioning = z.object({ data: z.record(z.string(), z.object({ uri: z.string() })) });

/**
 * The profile's "Authenticator app" page, where a user turns on two-factor sign-in: a QR
 * code for the app, and a field for the first code the app makes.
 */
export class TwoFactorSetupPage {
  constructor(readonly page: Page) {}

  /**
   * Opens the page and returns the secret the QR code holds, read from the server's
   * answer the page draws it from: an authenticator app would scan it.
   */
  async open(): Promise<string> {
    const answer = this.page.waitForResponse(
      (response) =>
        response.url().endsWith('/metadata') &&
        (response.request().postData() ?? '').includes('initiateOTPProvisioning'),
      { timeout: PAGE_LOAD },
    );
    await this.page.goto('/settings/profile/two-factor-authentication/TOTP');
    const { data } = Provisioning.parse(await (await answer).json());
    const [provisioning] = Object.values(data);
    if (!provisioning) throw new Error('No provisioning in the answer');
    return secretOf(provisioning.uri);
  }

  /** Types the code from the app and saves; the page goes back to the profile. */
  async confirm(code: string): Promise<void> {
    await this.page.getByRole('textbox').first().click();
    await this.page.keyboard.type(code);
    await this.page.getByRole('button', { name: 'Save' }).click();
    await expect(this.page).toHaveURL(/\/settings\/profile$/);
  }
}
