import { expect, test } from '@playwright/test';
import { e2eWalletPassword } from './test-wallet';

test('the unlock modal rejects an incorrect password and accepts the wallet password', async ({ page }) => {
  await page.goto('/accounts');
  const lockedWallet = page.locator('.nav-status-row:has-text("Wallet Locked")');
  await expect(lockedWallet).toBeVisible({ timeout: 15000 });
  await lockedWallet.click();

  const passwordInput = page.locator('#unlock-wallet-modal input[type="password"]');
  const unlockButton = page.getByTestId('wallet-widget-unlock-button');
  await expect(passwordInput).toBeVisible();
  await passwordInput.fill('incorrect-password');
  await unlockButton.click();
  await expect(lockedWallet).toBeVisible();

  await expect(unlockButton).toBeEnabled({ timeout: 1000 });
  await passwordInput.fill(e2eWalletPassword);
  await unlockButton.click();
  await expect(lockedWallet).not.toBeVisible();
  await expect(page.getByTestId('accounts-page-root')).toBeVisible({ timeout: 30000 });
});
