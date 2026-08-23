import { test as base, expect, Page } from '@playwright/test';
import { E2ETestWallet, e2eWalletPassword, getE2ETestWallet } from './test-wallet';

/**
 * Playwright fixtures for NanoNymNault E2E tests.
 *
 * All fixtures use real on-chain Nano transactions (feeless!) — no mocks.
 * The setup project injects a two-account encrypted wallet snapshot first.
 */

export type WalletFixtures = {
  /** Page with the setup project's wallet unlocked and ready. */
  seededPage: Page;
  /** Derived test-wallet accounts; the seed is intentionally not exposed. */
  testWallet: E2ETestWallet;
};

export const test = base.extend<WalletFixtures>({
  testWallet: [async ({}, use) => {
    await use(getE2ETestWallet());
  }, { scope: 'test' }],

  seededPage: async ({ page, testWallet }, use) => {
    await page.goto('/accounts');
    const lockedWallet = page.locator('.nav-status-row:has-text("Wallet Locked")');
    await expect(lockedWallet).toBeVisible({ timeout: 15000 });
    await lockedWallet.click();
    const passwordInput = page.locator('#unlock-wallet-modal input[type="password"]');
    await expect(passwordInput).toBeVisible({ timeout: 5000 });
    await passwordInput.fill(e2eWalletPassword);
    await page.locator('[data-testid="wallet-widget-unlock-button"]').click();
    await expect(page.locator('[data-testid="accounts-page-root"]')).toBeVisible({ timeout: 30000 });

    for (const account of testWallet.accounts) {
      await expect(page.locator(`[data-testid="accounts-row"][data-account-id="${account}"]`)).toBeVisible({ timeout: 15000 });
    }

    await use(page);
  },
});

export { expect };
