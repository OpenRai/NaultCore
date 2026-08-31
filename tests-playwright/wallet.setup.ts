import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { e2eStorageStatePath, getE2ETestWallet } from './test-wallet';
import { installStartupNetworkMocks } from './startup-network-mocks';

test('creates the reusable E2E wallet storage snapshot', async ({ page }) => {
  const wallet = getE2ETestWallet();
  await installStartupNetworkMocks(page);

  await page.addInitScript(storageValue => {
    localStorage.setItem('nanovault-wallet', storageValue);
  }, wallet.storageValue);
  await page.addInitScript(workCache => {
    localStorage.setItem('nanovault-workcache', JSON.stringify(workCache));
  }, wallet.workCache);
  await page.goto('/');

  await expect(page.locator('text=Wallet Locked')).toBeVisible({ timeout: 15000 });
  const storedAccounts = await page.evaluate(() => {
    const stored = localStorage.getItem('nanovault-wallet');
    return stored ? JSON.parse(stored).accounts.map((account: {id: string}) => account.id) : [];
  });
  expect(storedAccounts).toEqual(wallet.accounts);
  expect(wallet.accounts).toHaveLength(3);
  const fixture = wallet.workCache.entries[0];
  expect(fixture.account).toBe(wallet.accounts[2]);
  expect(fixture.root).toMatch(/^[0-9A-F]{64}$/);
  expect(fixture.threshold).toBe('FFFFFE0000000000');
  expect(fixture.work).toMatch(/^[0-9A-F]{16}$/);

  const statePath = resolve(e2eStorageStatePath);
  mkdirSync(dirname(statePath), { recursive: true });
  await page.context().storageState({ path: statePath });
});
