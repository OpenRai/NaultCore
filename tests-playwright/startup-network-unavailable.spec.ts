import { test, expect } from './fixtures';

test.use({ startupNetworkMode: 'unavailable' });

test('keeps the wallet shell usable when startup network adapters are unavailable', async ({ page, testWallet }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto('/accounts');
  await expect(page.locator('text=Wallet Locked')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('accounts-page-root')).toBeVisible({ timeout: 30000 });
  await expect(page.locator(`[data-testid="accounts-row"][data-account-id="${testWallet.accounts[0]}"]`)).toBeVisible();
  expect(pageErrors).toEqual([]);
});
