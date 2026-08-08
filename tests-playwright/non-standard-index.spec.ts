/**
 * E2E: Non-standard account index warning smoke test.
 *
 * Programmatically sets up localStorage with a wallet containing one standard
 * account (index 0) and one overflow account (index 197909032950, > 2^32-1).
 * Verifies that the ⚠️ emoji appears on the overflow account label and that
 * the account-details page shows a warning banner.
 */
import { test, expect } from '@playwright/test';
import CryptoJS from 'crypto-js';

const TEST_SEED = '0000000000000000000000000000000000000000000000000000000000000001';
const TEST_PASSWORD = 'test-overflow-1234';
const OVERFLOW_INDEX = 197909032950;

const ENCRYPTED_SEED = CryptoJS.AES.encrypt(TEST_SEED, TEST_PASSWORD).toString();

const WALLET_DATA = JSON.stringify({
  type: 'seed',
  seed: ENCRYPTED_SEED,
  locked: true,
  accounts: [
    { id: 'nano_111111111111111111111111111111111111111111111111111111111111hifuzz', index: 0 },
    { id: 'nano_3333333333333333333333333333333333333333333333333333333333333ciqbp', index: OVERFLOW_INDEX, nonStandardIndex: true },
  ],
  selectedAccountId: null,
});

test.describe('non-standard account index warning', () => {

  test('should show ⚠️ on overflow account and warning banner on details page', async ({ page }) => {
    // 1. Inject wallet into localStorage before the app loads
    await page.addInitScript((walletJson) => {
      localStorage.setItem('nanovault-wallet', walletJson);
    }, WALLET_DATA);

    // 2. Navigate — app picks up wallet from localStorage
    await page.goto('/');

    // 3. App should be locked — wait for the lock indicator
    await expect(page.locator('text=Wallet Locked')).toBeVisible({ timeout: 15000 });

    // 4. Click "Wallet Locked" row to open the unlock modal
    await page.locator('.nav-status-row:has-text("Wallet Locked")').click();

    // 5. Enter password and unlock
    const passwordInput = page.locator('#unlock-wallet-modal input[type="password"]');
    await expect(passwordInput).toBeVisible({ timeout: 5000 });
    await passwordInput.fill(TEST_PASSWORD);
    await page.locator('#unlock-wallet-modal button:has-text("Unlock")').click();

    // 6. Wait for accounts page to load after unlock
    await expect(page.locator('[data-testid="accounts-page-root"]')).toBeVisible({ timeout: 15000 });

    // Give Angular change detection time to propagate the nonStandardIndex flag
    await page.waitForTimeout(2000);

    // 7. Verify the non-standard warning notification appears
    await expect(page.locator('text=non-standard derivation indices')).toBeVisible({ timeout: 10000 });

    // 8. Verify ⚠️ emoji is present on the page (on the overflow account label)
    await expect(page.locator('text=\u26A0')).toBeVisible();

    // 9. Verify the overflow account row shows the warning emoji
    const accountRows = page.locator('[data-testid="accounts-row"]');
    const overflowRow = accountRows.filter({ hasText: String(OVERFLOW_INDEX) });
    await expect(overflowRow).toBeVisible();
    await expect(overflowRow.locator('.account-label')).toContainText('\u26A0');

    // 10. Verify the standard account does NOT have the warning emoji
    const standardRow = accountRows.filter({ hasText: 'Account #0' });
    await expect(standardRow.locator('.account-label')).not.toContainText('\u26A0');

    // 11. Click into the overflow account details
    await overflowRow.locator('[data-testid="accounts-row-details-button"]').click();

    // 12. Verify the warning banner on the details page
    await expect(page.locator('text=Non-standard account index')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Send all funds to a standard account')).toBeVisible();
  });

});
