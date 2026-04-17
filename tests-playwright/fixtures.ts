import { test as base, expect, Page } from '@playwright/test';

/**
 * Playwright fixtures for NanoNymNault E2E tests.
 *
 * All fixtures use real on-chain Nano transactions (feeless!) — no mocks.
 * Roundtrip tests are skipped if NANO_TEST_SEED env var is not set.
 */

export type WalletFixtures = {
  /** Page with a wallet already imported from NANO_TEST_SEED */
  seededPage: Page;
  /** The test seed from env, or null if unset */
  testSeed: string | null;
};

export const test = base.extend<WalletFixtures>({
  testSeed: [async ({}, use) => {
    const seed = process.env.NANO_TEST_SEED || null;
    await use(seed);
  }, { scope: 'test' }],

  seededPage: async ({ page, testSeed }, use) => {
    test.skip(!testSeed, 'NANO_TEST_SEED env var not set');

    // 1. Clear any existing wallet state, then navigate
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    // 2. Wait for welcome page
    await expect(page.locator('app-welcome a[href="/configure-wallet"]')).toBeVisible({ timeout: 15000 });

    // 3. Navigate to configure-wallet page
    await page.locator('app-welcome a[href="/configure-wallet"]').click();
    await expect(page).toHaveURL(/\/configure-wallet/);

    // 4. Click "Import Existing Seed"
    await page.locator('[data-testid="configure-wallet-import-seed-button"]').click();

    // 5. Fill in the seed
    await page.locator('input[placeholder="64 hex character secret recovery seed"]').fill(testSeed!);

    // 6. Click "Import from Seed" to proceed to password
    await page.locator('[data-testid="configure-wallet-import-from-seed-button"]').click();

    // 7. Set wallet password
    await page.locator('input[placeholder="New Wallet Password"]').fill('test1234');
    await page.locator('input[placeholder="Confirm Wallet Password"]').fill('test1234');

    // 8. Click Next/Import
    await page.locator('[data-testid="configure-wallet-password-next-button"]').click();

    // 9. Wait for import to complete and navigate to accounts
    await page.waitForURL('**/accounts', { timeout: 30000 });

    // 10. Wait for balance loading
    await page.waitForTimeout(5000);

    // 11. Ensure we have at least 2 accounts — create one if needed
    const accountRows = page.locator('[data-testid="accounts-row"]');
    let rowCount = await accountRows.count();
    if (rowCount < 2) {
      const createButton = page.locator('[data-testid="accounts-create-account-button"]');
      if (await createButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await createButton.click();
        await page.waitForTimeout(2000);
        rowCount = await accountRows.count();
      }
    }
    expect(rowCount).toBeGreaterThanOrEqual(2);

    await use(page);
  },
});

export { expect };
