import { test as base, expect, Page } from '@playwright/test';
import { E2ETestWallet, e2eWalletPassword, getE2ETestWallet } from './test-wallet';
import { installStartupNetworkMocks, installUnavailableStartupNetwork } from './startup-network-mocks';

/**
 * Playwright fixtures for NaultCore E2E tests.
 *
 * UI fixtures use deterministic startup mocks by default. Funded transaction
 * suites opt into the live adapters explicitly. The setup project injects a
 * three-account encrypted wallet snapshot first.
 */

export type WalletFixtures = {
  /** Page with the setup project's wallet unlocked and ready. */
  seededPage: Page;
  /** Derived test-wallet accounts; the seed is intentionally not exposed. */
  testWallet: E2ETestWallet;
};

type StartupFixtures = {
  /** Mock by default; live network must be explicitly opted into by a suite. */
  startupNetworkMode: 'mock' | 'live' | 'unavailable';
  startupNetwork: void;
};

export async function unlockWalletThroughBridge(page: Page, password = e2eWalletPassword): Promise<void> {
  await page.waitForFunction(() => typeof window.__NAULTCORE_E2E__?.unlock === 'function');
  const unlocked = await page.evaluate(value => window.__NAULTCORE_E2E__!.unlock(value), password);
  expect(unlocked).toBe(true);
}

export const test = base.extend<WalletFixtures & StartupFixtures>({
  startupNetworkMode: ['mock', { option: true }],

  startupNetwork: [async ({ page, startupNetworkMode }, use) => {
    if (startupNetworkMode === 'mock') await installStartupNetworkMocks(page);
    if (startupNetworkMode === 'unavailable') await installUnavailableStartupNetwork(page);
    await use();
  }, { auto: true }],

  testWallet: [async ({}, use, testInfo) => {
    if (!process.env.NANO_TEST_SEED?.trim()) {
      testInfo.skip(true, 'NANO_TEST_SEED is required for seeded or funded E2E tests.');
      return;
    }
    await use(getE2ETestWallet());
  }, { scope: 'test' }],

  seededPage: async ({ page, testWallet }, use) => {
    await page.goto('/accounts');
    const lockedWallet = page.locator('.nav-status-row:has-text("Wallet Locked")');
    await expect(lockedWallet).toBeVisible({ timeout: 15000 });
    await unlockWalletThroughBridge(page);
    await expect(lockedWallet).not.toBeVisible();
    await expect(page.locator('[data-testid="accounts-page-root"]')).toBeVisible({ timeout: 30000 });

    for (const account of testWallet.accounts) {
      await expect(page.locator(`[data-testid="accounts-row"][data-account-id="${account}"]`)).toBeVisible({ timeout: 15000 });
    }

    await use(page);
  },
});

export { expect };
