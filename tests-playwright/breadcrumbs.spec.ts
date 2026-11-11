import { test, expect, unlockWalletThroughBridge } from './fixtures';

for (const activity of ['send', 'receive'] as const) {
  test(`${activity}: Dashboard origin survives selection, refresh, and browser navigation`, async ({ seededPage, testWallet }) => {
    await seededPage.goto('/wallet');
    await unlockWalletThroughBridge(seededPage);
    await seededPage.getByTestId(`wallet-${activity}-button`).click();
    const trail = seededPage.getByRole('navigation', { name: 'Breadcrumb', exact: true });
    await expect(trail.getByRole('link', { name: 'Dashboard', exact: true })).toHaveAttribute('href', '/wallet');
    await expect(trail.locator('[aria-current="page"]')).toHaveText(activity === 'send' ? 'Send' : 'Receive');
    await seededPage.locator(`button[data-account-id="${testWallet.accounts[0]}"]`).click();
    await expect(seededPage).toHaveURL(/origin=dashboard/);
    await seededPage.reload();
    await unlockWalletThroughBridge(seededPage);
    await expect(trail.getByRole('link', { name: 'Dashboard', exact: true })).toBeVisible();
    await trail.getByRole('link').click();
    await expect(seededPage).toHaveURL(/\/wallet$/);
    await seededPage.goBack();
    await expect(trail.getByRole('link', { name: 'Dashboard', exact: true })).toBeVisible();
    await seededPage.goForward();
    await expect(seededPage).toHaveURL(/\/wallet$/);
  });

  for (const width of [1280, 393]) {
    test(`${activity}: account details returns to Accounts at ${width}px`, async ({ seededPage, testWallet }) => {
      await seededPage.setViewportSize({ width, height: 852 });
      const row = seededPage.locator(`[data-testid="accounts-row"][data-account-id="${testWallet.accounts[0]}"]`);
      await row.getByTestId('accounts-row-details-button').click();
      const trail = seededPage.getByRole('navigation', { name: 'Breadcrumb', exact: true });
      await expect(trail.getByRole('link', { name: 'Accounts', exact: true })).toHaveAttribute('href', '/accounts');
      await expect(trail.locator('[aria-current="page"]')).not.toBeEmpty();
      await seededPage.locator(`[data-testid="accountDetails.transactionActions"] a[href="/${activity}?account=${testWallet.accounts[0]}&origin=accounts"]`).filter({ visible: true }).click();
      await expect(trail.locator('li')).toHaveCount(2);
      await expect(trail.locator('[aria-current="page"]')).toHaveText(activity === 'send' ? 'Send' : 'Receive');
      await seededPage.getByRole('button', { name: activity === 'send' ? 'Change source account' : 'Change destination account', exact: true }).click();
      await seededPage.locator(`button[data-account-id="${testWallet.accounts[1]}"]`).click();
      await expect(seededPage).toHaveURL(/origin=accounts/);
      await expect(trail.getByRole('link', { name: 'Accounts', exact: true })).toBeVisible();
      const bounds = await trail.boundingBox();
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      await trail.getByRole('link').focus();
      await seededPage.keyboard.press('Enter');
      await expect(seededPage).toHaveURL(/\/accounts$/);
    });
  }
}

test('direct links and invalid origins offer Dashboard as the return destination', async ({ page }) => {
  for (const url of ['/send', '/receive?origin=unknown']) {
    await page.goto(url);
    const trail = page.getByRole('navigation', { name: 'Breadcrumb', exact: true });
    await expect(trail.getByRole('link', { name: 'Dashboard', exact: true })).toHaveAttribute('href', '/wallet');
  }
});
