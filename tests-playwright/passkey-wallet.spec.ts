import { randomBytes } from 'node:crypto';
import CryptoJS from 'crypto-js';
import type { CDPSession, Page } from '@playwright/test';
import { test, expect } from './fixtures';

const walletPassword = 'passkey-e2e-wallet-password';

type VirtualAuthenticator = {
  session: CDPSession;
  authenticatorId: string;
};

test.use({
  storageState: { cookies: [], origins: [] },
  screenshot: 'off',
  trace: 'off',
});

async function installVirtualAuthenticator(page: Page, options: {
  hasPrf?: boolean;
  automaticPresenceSimulation?: boolean;
} = {}): Promise<VirtualAuthenticator> {
  const session = await page.context().newCDPSession(page);
  await session.send('WebAuthn.enable');
  const { authenticatorId } = await session.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      ctap2Version: 'ctap2_1',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      hasPrf: options.hasPrf ?? true,
      isUserVerified: true,
      automaticPresenceSimulation: options.automaticPresenceSimulation ?? true,
    },
  });
  return { session, authenticatorId };
}

async function startWithEmptyWallet(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/configure-wallet');
}

async function createWalletAndEnroll(page: Page): Promise<void> {
  await startWithEmptyWallet(page);
  await page.getByTestId('configure-wallet-new-wallet-button').click();
  await page.getByPlaceholder('New Wallet Password').fill(walletPassword);
  await page.getByPlaceholder('Confirm Wallet Password').fill(walletPassword);
  await page.getByTestId('configure-wallet-password-next-button').click();

  const backupConfirmation = page.locator('.backup-confirmation input[type="checkbox"]');
  await expect(backupConfirmation).toBeVisible();
  await backupConfirmation.check();
  await page.getByTestId('configure-wallet-create-wallet-button').click();
  await expect(page.getByRole('heading', { name: 'Wallet Created!' })).toBeVisible();
  await page.getByRole('button', { name: 'Set up passkey unlock' }).click();
  await expect.poll(async () => walletStorage(page)).toMatchObject({ hasPasskey: true });
}

async function walletStorage(page: Page): Promise<{ seedCiphertext: string; hasPasskey: boolean; localWalletId: string|null }> {
  return page.evaluate(() => {
    const serialized = localStorage.getItem('nanovault-wallet');
    if (!serialized) return { seedCiphertext: '', hasPasskey: false, localWalletId: null };
    const wallet = JSON.parse(serialized);
    return {
      seedCiphertext: wallet.seed || '',
      hasPasskey: Array.isArray(wallet.passkeyUnlock?.credentials) && wallet.passkeyUnlock.credentials.length > 0,
      localWalletId: wallet.localWalletId || null,
    };
  });
}

function isPasswordEncryptedWallet(ciphertext: string): boolean {
  const secret = CryptoJS.AES.decrypt(ciphertext, walletPassword).toString(CryptoJS.enc.Utf8);
  return /^[0-9a-f]{64}$/i.test(secret) && ciphertext !== secret;
}

async function unlockWithPasskeyFromSidebar(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Wallet Locked/ }).click();
  await expect(page.locator('#unlock-wallet-modal')).toBeVisible();
  await expect(page.getByRole('button', { name: /Wallet Unlocked/ })).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#unlock-wallet-modal')).toBeHidden();
}

async function lockFromSidebar(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Wallet Unlocked/ }).click();
  await expect(page.getByRole('button', { name: /Wallet Locked/ })).toBeVisible();
}

async function enterWalletPassword(page: Page): Promise<void> {
  const password = page.locator('#unlock-wallet-modal input[type="password"]');
  await expect(password).toBeVisible();
  await password.fill(walletPassword);
  await page.getByTestId('wallet-widget-unlock-button').click();
  await expect(page.getByRole('button', { name: /Wallet Unlocked/ })).toBeVisible();
}

test.describe('passkey wallet journeys', () => {
  test('creates a wallet, unlocks a gated Receive action with a passkey, relocks, and retains password recovery', async ({ page }) => {
    const authenticator = await installVirtualAuthenticator(page);
    await createWalletAndEnroll(page);

    const saved = await walletStorage(page);
    expect(saved.hasPasskey).toBe(true);
    expect(isPasswordEncryptedWallet(saved.seedCiphertext)).toBe(true);

    await page.reload();
    await expect(page.getByRole('button', { name: /Wallet Locked/ })).toBeVisible();
    await page.goto('/accounts');
    await expect(page.getByTestId('accounts-page-root')).toBeVisible();
    await expect(page.getByTestId('receive-account-button').first()).toBeVisible();
    await page.getByTestId('receive-account-button').first().click();
    await expect(page.locator('#unlock-wallet-modal')).toBeVisible();
    await expect(page.getByRole('button', { name: /Wallet Unlocked/ })).toBeVisible({ timeout: 15000 });
    // Dismiss the completed gate explicitly; UIkit can leave the modal in its transition
    // state while the route change from the gated action completes.
    await page.getByTestId('wallet-widget-cancel-button').click();
    await expect(page.locator('#unlock-wallet-modal')).toBeHidden();
    await expect(page).toHaveURL(/\/receive\?account=/);

    await lockFromSidebar(page);
    await expect(page.getByText('You must set a password on your wallet - it is currently blank!')).toHaveCount(0);
    const credentials = await authenticator.session.send('WebAuthn.getCredentials', {
      authenticatorId: authenticator.authenticatorId,
    });
    expect(credentials.credentials.length).toBeGreaterThan(0);
    await authenticator.session.send('WebAuthn.removeCredential', {
      authenticatorId: authenticator.authenticatorId,
      credentialId: credentials.credentials[0].credentialId,
    });
    await page.getByRole('button', { name: /Wallet Locked/ }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Device authentication did not unlock the wallet' })).toBeVisible({ timeout: 15000 });
    await enterWalletPassword(page);
    await authenticator.session.detach();
  });

  test('imports recovery material, enrolls later, and restores an encrypted backup without reconnecting the passkey', async ({ page }) => {
    const authenticator = await installVirtualAuthenticator(page);
    const testOnlySeed = randomBytes(32).toString('hex').toUpperCase();
    await startWithEmptyWallet(page);
    await page.getByTestId('configure-wallet-recovery-import-button').click();
    await page.getByTestId('configure-wallet-recovery-material-input').fill(testOnlySeed);
    await page.getByRole('button', { name: 'Check recovery material' }).click();
    await expect(page.getByTestId('configure-wallet-recovery-preview')).toBeVisible();
    await expect(page.getByText('Checking compatible recoveries...')).toHaveCount(0, { timeout: 30000 });
    const continueRecovery = page.getByRole('button', { name: /Restore anyway|Restore with selected method/ });
    await expect(continueRecovery).toBeVisible();
    await continueRecovery.click();
    await page.getByPlaceholder('New Wallet Password').fill(walletPassword);
    await page.getByPlaceholder('Confirm Wallet Password').fill(walletPassword);
    await page.getByTestId('configure-wallet-password-next-button').click();
    await expect(page.getByRole('button', { name: /Wallet Unlocked/ })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Successfully imported wallet!')).toBeVisible({ timeout: 15000 });

    await page.goto('/manage-wallet');
    await expect(page.getByRole('button', { name: /Wallet Locked/ })).toBeVisible();
    await page.getByRole('button', { name: /Wallet Locked/ }).click();
    await enterWalletPassword(page);
    await page.getByRole('button', { name: /Enable passkey unlock/ }).click();
    await expect.poll(async () => walletStorage(page)).toMatchObject({ hasPasskey: true });
    const enrolledWalletId = (await walletStorage(page)).localWalletId;
    const backupCard = page.locator('.uk-card').filter({ hasText: /Export .* Wallet/ });
    await backupCard.getByTestId('manage-wallet-backup-wallet-button').click();
    const exportUrlField = backupCard.locator('input[type="text"]');
    const exportUrl = await exportUrlField.inputValue();
    const exportData = JSON.parse(Buffer.from(new URL(exportUrl).hash.slice(1), 'base64').toString('utf8'));
    expect(exportData.passkeyUnlock).toBeUndefined();
    await exportUrlField.evaluate(element => ((element as HTMLInputElement).value = '[redacted test backup]'));

    // Restore in a clean origin context while copying only the virtual authenticator
    // credential. This models a fresh app profile with an existing device passkey.
    const credentials = await authenticator.session.send('WebAuthn.getCredentials', {
      authenticatorId: authenticator.authenticatorId,
    });
    const restoreContext = await page.context().browser()!.newContext({ storageState: { cookies: [], origins: [] } });
    const restorePage = await restoreContext.newPage();
    const restoredAuthenticator = await installVirtualAuthenticator(restorePage);
    await restoredAuthenticator.session.send('WebAuthn.addCredential', {
      authenticatorId: restoredAuthenticator.authenticatorId,
      credential: credentials.credentials[0],
    });
    await restorePage.goto(exportUrl);
    await restorePage.getByPlaceholder('Wallet Password', { exact: true }).fill(walletPassword);
    await restorePage.getByRole('button', { name: 'Import Wallet' }).click();
    await expect(restorePage.getByTestId('accounts-page-root')).toBeVisible({ timeout: 15000 });
    await expect(restorePage.getByRole('button', { name: /Wallet Unlocked/ })).toBeVisible();

    const restored = await walletStorage(restorePage);
    expect(restored.hasPasskey).toBe(false);
    expect(restored.localWalletId).not.toBe(enrolledWalletId);
    expect(isPasswordEncryptedWallet(restored.seedCiphertext)).toBe(true);
    await lockFromSidebar(restorePage);
    await restorePage.getByRole('button', { name: /Wallet Locked/ }).click();
    await expect(restorePage.locator('#unlock-wallet-modal input[type="password"]')).toBeVisible();
    await enterWalletPassword(restorePage);
    await restoredAuthenticator.session.detach();
    await restoreContext.close();
    await authenticator.session.detach();
  });

  test('keeps password access when the authenticator does not return PRF output', async ({ page }) => {
    const authenticator = await installVirtualAuthenticator(page, { hasPrf: false });
    await startWithEmptyWallet(page);
    await page.getByTestId('configure-wallet-new-wallet-button').click();
    await page.getByPlaceholder('New Wallet Password').fill(walletPassword);
    await page.getByPlaceholder('Confirm Wallet Password').fill(walletPassword);
    await page.getByTestId('configure-wallet-password-next-button').click();
    await page.locator('.backup-confirmation input[type="checkbox"]').check();
    await page.getByTestId('configure-wallet-create-wallet-button').click();
    await page.getByRole('button', { name: 'Set up passkey unlock' }).click();

    await expect.poll(async () => walletStorage(page)).toMatchObject({ hasPasskey: false });
    const saved = await walletStorage(page);
    expect(isPasswordEncryptedWallet(saved.seedCiphertext)).toBe(true);
    await lockFromSidebar(page);
    await page.getByRole('button', { name: /Wallet Locked/ }).click();
    await enterWalletPassword(page);
    await authenticator.session.detach();
  });

  test('shows password and retry after a missing credential, then permits password recovery and re-enrollment', async ({ page }) => {
    const authenticator = await installVirtualAuthenticator(page);
    await createWalletAndEnroll(page);
    const credentials = await authenticator.session.send('WebAuthn.getCredentials', {
      authenticatorId: authenticator.authenticatorId,
    });
    const [credential] = credentials.credentials;
    expect(credential).toBeTruthy();
    await authenticator.session.send('WebAuthn.removeCredential', {
      authenticatorId: authenticator.authenticatorId,
      credentialId: credential.credentialId,
    });

    await lockFromSidebar(page);
    await page.getByRole('button', { name: /Wallet Locked/ }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Device authentication did not unlock the wallet' })).toBeVisible({ timeout: 15000 });
    const retry = page.getByRole('button', { name: 'Try device authentication again' });
    await expect(retry).toBeVisible();
    await retry.click();
    await expect(page.getByRole('status').filter({ hasText: 'Device authentication did not unlock the wallet' })).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#unlock-wallet-modal input[type="password"]')).toBeVisible();

    await enterWalletPassword(page);
    await page.goto('/manage-wallet');
    await expect(page.getByRole('button', { name: /Wallet Locked/ })).toBeVisible();
    await page.getByRole('button', { name: /Wallet Locked/ }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Device authentication did not unlock the wallet' })).toBeVisible({ timeout: 15000 });
    await enterWalletPassword(page);
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Remove passkey' }).click();
    await expect.poll(async () => walletStorage(page)).toMatchObject({ hasPasskey: false });
    await page.getByRole('button', { name: /Enable passkey unlock|Add another passkey/ }).click();
    await expect.poll(async () => walletStorage(page)).toMatchObject({ hasPasskey: true });
    await lockFromSidebar(page);
    await page.getByRole('button', { name: /Wallet Locked/ }).click();
    await expect(page.getByRole('button', { name: /Wallet Unlocked/ })).toBeVisible({ timeout: 15000 });
    await authenticator.session.detach();
  });

  test('aborts pending authentication when the unlock modal is dismissed', async ({ page }) => {
    const authenticator = await installVirtualAuthenticator(page);
    await createWalletAndEnroll(page);
    await lockFromSidebar(page);
    await authenticator.session.send('WebAuthn.setAutomaticPresenceSimulation', {
      authenticatorId: authenticator.authenticatorId,
      enabled: false,
    });

    await page.getByRole('button', { name: /Wallet Locked/ }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Waiting for device authentication' })).toBeVisible();
    await page.getByTestId('wallet-widget-cancel-button').click();
    await expect(page.locator('#unlock-wallet-modal')).toBeHidden();
    await expect(page.getByRole('button', { name: /Wallet Locked/ })).toBeVisible();

    await authenticator.session.send('WebAuthn.setAutomaticPresenceSimulation', {
      authenticatorId: authenticator.authenticatorId,
      enabled: true,
    });
    await unlockWithPasskeyFromSidebar(page);
    await authenticator.session.detach();
  });
});
