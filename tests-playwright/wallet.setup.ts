import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { e2eStorageStatePath, getE2ETestWallet } from './test-wallet';

test('creates the reusable E2E wallet storage snapshot', async ({ page }) => {
  const wallet = getE2ETestWallet();

  await page.addInitScript(storageValue => {
    localStorage.setItem('nanovault-wallet', storageValue);
  }, wallet.storageValue);
  await page.goto('/');

  await expect(page.locator('text=Wallet Locked')).toBeVisible({ timeout: 15000 });
  const storedAccounts = await page.evaluate(() => {
    const stored = localStorage.getItem('nanovault-wallet');
    return stored ? JSON.parse(stored).accounts.map((account: {id: string}) => account.id) : [];
  });
  expect(storedAccounts).toEqual(wallet.accounts);

  const statePath = resolve(e2eStorageStatePath);
  mkdirSync(dirname(statePath), { recursive: true });
  await page.context().storageState({ path: statePath });
});
