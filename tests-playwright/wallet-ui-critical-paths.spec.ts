import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';

async function navigate(page: Page, path: string): Promise<void> {
  const target = page.locator(`a[href="${path}"]`).first();
  if (!await target.isVisible()) {
    const settingsPaths = new Set(['/configure-app', '/manage-wallet', '/representatives']);
    await page.getByRole('link', {
      name: settingsPaths.has(path) ? 'Settings' : 'Advanced Tools',
      exact: true,
    }).click();
  }
  await target.click();
  await expect(page).toHaveURL(new RegExp(`${path.replace('/', '\\/')}(?:\\?.*)?$`));
}

async function dismissPersistentNotifications(page: Page): Promise<void> {
  const closeButton = page.locator('.wallet-notification .close-notification').first();
  if (await closeButton.isVisible().catch(() => false)) {
    await closeButton.click();
  }
}

test('opens an account and shows its account details', async ({ seededPage, testWallet }) => {
  await seededPage.locator(
    `[data-testid="accounts-row"][data-account-id="${testWallet.accounts[0]}"]`,
  ).getByTestId('accounts-row-details-button').click();

  await expect(seededPage).toHaveURL(new RegExp(`/account/${testWallet.accounts[0]}`));
  await expect(seededPage.getByText(testWallet.accounts[0], { exact: false }).first()).toBeVisible();
});

test('keeps the current account PoW status visible in the full Account Details card', async ({ seededPage, testWallet }) => {
  await seededPage.locator(
    `[data-testid="accounts-row"][data-account-id="${testWallet.accounts[0]}"]`,
  ).getByTestId('accounts-row-details-button').click();

  const workStatus = seededPage.getByTestId('account-details-work-status');
  await expect(workStatus).toBeVisible();
  await expect(workStatus).toContainText(/Proof-of-Work: (ready|processing|missing)/i);
  await expect(workStatus).not.toContainText(/[0-9A-F]{16}/i);
});

test('keeps the current account PoW status visible in the compact Account Details card', async ({ seededPage, testWallet }) => {
  await seededPage.setViewportSize({ width: 800, height: 900 });
  await seededPage.goto(`/account/${testWallet.accounts[0]}?compact=1`);

  const workStatus = seededPage.getByTestId('account-details-work-status-compact');
  await expect(workStatus).toBeVisible();
  await expect(workStatus).toContainText(/Proof-of-Work: (ready|processing|missing)/i);
  await expect(workStatus).not.toContainText(/[0-9A-F]{16}/i);
});

test('shows the selected account receive address', async ({ seededPage, testWallet }) => {
  await navigate(seededPage, '/receive');

  await expect(seededPage.getByTestId('receive-page-root')).toBeVisible();
  await seededPage.getByRole('combobox', { name: 'Account' }).selectOption(testWallet.accounts[0]);
  await expect(seededPage.getByTestId('receive-address-value')).toContainText(testWallet.accounts[0]);
});

test('keeps representative information out of primary wallet status', async ({ seededPage }) => {
  await expect(seededPage.locator('app-change-rep-widget')).toHaveCount(0);
  await expect(seededPage.locator('.nav-representative-info')).toHaveCount(0);
  await expect(seededPage.getByText(/Unknown Rep|Acceptable|Representative Change Required/i)).toHaveCount(0);
});

test('adds, edits, and removes an address-book contact', async ({ seededPage, testWallet }) => {
  await navigate(seededPage, '/address-book');
  await seededPage.getByTestId('address-book-add-contact-button').click();
  await seededPage.locator('#new-address-name').fill('E2E contact');
  await seededPage.locator('#new-address-account').fill(testWallet.accounts[1]);
  await seededPage.getByRole('button', { name: /save/i }).click();

  const contact = seededPage.getByTestId('address-book-row').filter({ hasText: 'E2E contact' });
  await expect(contact).toBeVisible();
  await contact.getByTestId('address-book-row-edit-button').click();
  await seededPage.locator('#new-address-name').fill('E2E contact edited');
  await seededPage.getByRole('button', { name: /save/i }).click();

  const editedContact = seededPage.getByTestId('address-book-row').filter({ hasText: 'E2E contact edited' });
  await expect(editedContact).toBeVisible();
  await editedContact.getByTestId('address-book-row-delete-button').click();
  const confirmation = seededPage.locator('.uk-modal.uk-open');
  if (await confirmation.isVisible().catch(() => false)) {
    await confirmation.getByRole('button', { name: /ok/i }).click();
  }
  await expect(editedContact).not.toBeVisible();
});

test('updates display settings', async ({ seededPage }) => {
  await navigate(seededPage, '/configure-app');
  await expect(seededPage.getByTestId('app-settings-page-root')).toBeVisible();

  const currency = seededPage.locator('select').filter({ has: seededPage.locator('option[value="EUR"]') });
  await currency.selectOption('EUR');
  await seededPage.getByRole('button', { name: 'Update Display Settings' }).click();

  await expect(currency).toHaveValue('EUR');
});

test('exports a wallet backup', async ({ seededPage }) => {
  await navigate(seededPage, '/manage-wallet');
  await expect(seededPage.getByTestId('manage-wallet-page-root')).toBeVisible();
  await seededPage.getByTestId('manage-wallet-backup-wallet-button').click();

  const exportCard = seededPage.locator('.uk-card').filter({ hasText: 'Export Nault Wallet' });
  await expect(exportCard.locator('input[type="text"]')).toHaveValue(/^http:\/\/localhost:4200\/import-wallet#/);
  await expect(seededPage.getByRole('button', { name: 'Export As File' })).toBeVisible();
});

test('opens the representative management flow', async ({ seededPage }) => {
  await navigate(seededPage, '/representatives');
  await expect(seededPage.getByTestId('representatives-page-root')).toBeVisible();
  await seededPage.getByTestId('representatives-manage-representatives-button').click();

  await expect(seededPage).toHaveURL(/\/manage-representatives/);
  await expect(seededPage.getByTestId('manage-representatives-page-root')).toBeVisible();
  await expect(seededPage.getByRole('heading', { name: /representatives book/i })).toBeVisible();
});

test('starts remote signing for an account', async ({ seededPage, testWallet }) => {
  await navigate(seededPage, '/remote-signing');
  await seededPage.locator('input[placeholder="nano_1abc..."]').fill(testWallet.accounts[1]);
  await seededPage.getByTestId('remote-signing-create-button').click();

  await expect(seededPage).toHaveURL(new RegExp(`/account/${testWallet.accounts[1]}\\?sign=1`));
});

test('generates a keypair', async ({ page }) => {
  await page.goto('/keygenerator');
  await dismissPersistentNotifications(page);
  await page.getByTestId('keygenerator-generate-keypair-button').click();

  const generator = page.locator('.uk-card').filter({ hasText: 'Generate a new random keypair' });
  await expect(generator.locator('.nano-address-monospace')).toContainText(/nano_[13][13456789abcdefghijkmnopqrstuwxyz]{59}/);
  await expect(page.getByText('Copy Private Key')).toBeVisible();
});

test('converts XNO to raw', async ({ page }) => {
  await page.goto('/converter');
  await dismissPersistentNotifications(page);
  await page.locator('#mnano').fill('1');

  await expect(page.locator('#raw')).toHaveValue('1000000000000000000000000000000');
});

test('generates a QR code from text', async ({ page }) => {
  await page.goto('/qr-generator');
  await dismissPersistentNotifications(page);
  await page.getByPlaceholder('Text to be converted into QR').fill('Nano E2E');

  await expect(page.getByAltText('QR code')).toHaveAttribute('src', /^data:image\/png;base64,/);
});
