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

test('a locked wallet with a receivable shows an unlockable receivable card', async ({ page }) => {
  await mockWalletReceivable(page);
  await page.goto('/accounts');

  const lockedWallet = page.locator('.nav-status-row:has-text("Wallet Locked")');
  const receivableCard = page.getByTestId('incoming-balance-card');
  await expect(lockedWallet).toBeVisible({ timeout: 15000 });
  await expect(receivableCard).toBeVisible({ timeout: 15000 });
  await expect(receivableCard).toContainText('Receivable');
  await expect(receivableCard).toContainText('Confirmed');

  await receivableCard.click();
  await expect(page.locator('#unlock-wallet-modal input[type="password"]')).toBeVisible();
});

test('the Wallet workspace exposes a mobile-safe unlock response for receivable funds', async ({ page }) => {
  await mockWalletReceivable(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/wallet');

  const unlockReceivable = page.getByTestId('wallet-unlock-receivable-button');
  await expect(unlockReceivable).toBeVisible({ timeout: 15000 });
  await expect(unlockReceivable).toContainText('Confirmed funds ready to receive');
  await expect(unlockReceivable).toContainText('Unlock to sign the receive block and claim incoming Nano.');
  await unlockReceivable.press('Enter');

  const unlockModal = page.locator('#unlock-wallet-modal');
  await expect(unlockModal).toBeVisible();
  await expect(unlockModal).toContainText('sign a receive block for confirmed funds and spend funds from this wallet');
});

test('an account Receive entry point uses unlock while the wallet is locked', async ({ page }) => {
  await mockWalletReceivable(page);
  await page.goto('/accounts');

  const receiveButton = page.getByTestId('receive-account-button').first();
  await expect(receiveButton).toBeVisible({ timeout: 15000 });
  await receiveButton.click();

  await expect(page.locator('#unlock-wallet-modal')).toBeVisible();
  await expect(page).toHaveURL(/\/accounts$/);

  await page.locator('#unlock-wallet-modal input[type="password"]').fill(e2eWalletPassword);
  await page.getByTestId('wallet-widget-unlock-button').click();
  await expect(page).toHaveURL(new RegExp(`/receive\\?account=${getE2ETestWallet().accounts[0]}$`));
  await expect(page.getByTestId('receive-page-root')).toBeVisible({ timeout: 15000 });
});
