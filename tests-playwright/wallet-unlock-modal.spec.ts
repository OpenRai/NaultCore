import { expect, test } from '@playwright/test';
import { e2eWalletPassword, getE2ETestWallet } from './test-wallet';

const pendingAmountRaw = '100000000000000000000000000000';

async function mockWalletReceivable(page: import('@playwright/test').Page): Promise<void> {
  const wallet = getE2ETestWallet();
  const [receivingAccount, sourceAccount] = wallet.accounts;

  await page.route('**/*', async route => {
    const request = route.request();
    if (request.method() !== 'POST') {
      await route.continue();
      return;
    }

    let action: string | undefined;
    try {
      action = request.postDataJSON()?.action;
    } catch {
      await route.continue();
      return;
    }
    if (action === 'accounts_balances') {
      await route.fulfill({ json: {
        balances: {
          [receivingAccount]: { balance: '0', pending: pendingAmountRaw },
          [sourceAccount]: { balance: '0', pending: '0' },
        },
      } });
      return;
    }
    if (action === 'accounts_frontiers') {
      await route.fulfill({ json: { frontiers: {} } });
      return;
    }
    if (action === 'accounts_pending') {
      await route.fulfill({ json: {
        blocks: {
          [receivingAccount]: {
            ['A'.repeat(64)]: { amount: pendingAmountRaw, source: sourceAccount },
          },
        },
      } });
      return;
    }

    await route.continue();
  });
}

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

test('a locked wallet with a receivable shows an unlockable incoming balance card', async ({ page }) => {
  await mockWalletReceivable(page);
  await page.goto('/accounts');

  const lockedWallet = page.locator('.nav-status-row:has-text("Wallet Locked")');
  const incomingBalanceCard = page.getByTestId('incoming-balance-card');
  await expect(lockedWallet).toBeVisible({ timeout: 15000 });
  await expect(incomingBalanceCard).toBeVisible({ timeout: 15000 });
  await expect(incomingBalanceCard).toContainText('Incoming Balance');

  await incomingBalanceCard.click();
  await expect(page.locator('#unlock-wallet-modal input[type="password"]')).toBeVisible();
});
