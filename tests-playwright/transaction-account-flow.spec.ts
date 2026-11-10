import { test, expect } from './fixtures';

test('keeps navigation as wallet places and exposes Accounts through dashboard tabs', async ({ seededPage }) => {
  const navigation = seededPage.getByRole('navigation', { name: 'Main', exact: true });
  await expect(navigation.getByRole('link').first()).toHaveText('Wallet accounts');
  await expect(navigation.getByRole('link', { name: /^(Send|Receive|Accounts)$/ })).toHaveCount(0);
  await seededPage.getByTestId('wallet-dashboard-link').click();
  await expect(seededPage).toHaveURL(/\/wallet$/);
  await seededPage.getByRole('link', { name: 'Accounts', exact: true }).click();
  await expect(seededPage).toHaveURL(/\/accounts$/);
  await navigation.getByRole('link', { name: 'Wallet accounts', exact: true }).click();
  await expect(seededPage).toHaveURL(/\/wallet$/);
});

for (const width of [393, 1280]) {
  test(`keeps account actions visible with explicit scope at ${width}px, locked with zero balance`, async ({ seededPage, testWallet }, testInfo) => {
    await seededPage.setViewportSize({ width, height: 900 });
    await seededPage.goto(`/account/${testWallet.accounts[1]}${width < 960 ? '?compact=1' : ''}`);
    const actions = seededPage.locator('[data-testid="accountDetails.transactionActions"]:visible');
    await expect(actions).toHaveCount(1);
    await expect(actions.getByRole('link', { name: 'Send', exact: true })).toBeVisible();
    await expect(actions.getByRole('link', { name: 'Receive', exact: true })).toBeVisible();
    await expect(actions.getByRole('link', { name: 'Send', exact: true })).toHaveAttribute('href', `/send?account=${testWallet.accounts[1]}`);
    await seededPage.screenshot({ path: testInfo.outputPath(`account-actions-${width}.png`), fullPage: true, animations: 'disabled' });
    await actions.getByRole('link', { name: 'Receive', exact: true }).click();
    await expect(seededPage.getByTestId('receive-address-value')).toContainText(testWallet.accounts[1]);
    await expect(seededPage.getByTestId('transaction.accountPicker')).toHaveCount(0);
    await expect(seededPage.getByRole('img', { name: 'QR code', exact: true })).toBeVisible();
    const shareBox = await seededPage.getByTestId('receive.shareAddress').boundingBox();
    expect(shareBox!.x + shareBox!.width).toBeLessThanOrEqual(width);
    await seededPage.screenshot({ path: testInfo.outputPath(`receive-${width}.png`), fullPage: true, animations: 'disabled' });
  });
}

test('preserves the payment draft through source changes and review editing', async ({ seededPage, testWallet }) => {
  await seededPage.route('**/*', async route => {
    let request: { action?: string } = {};
    try { request = route.request().postDataJSON() || {}; } catch { /* non-RPC request */ }
    if (request.action === 'account_info') {
      await route.fulfill({ json: {
        balance: '10000000000000000000000000000000', pending: '0', frontier: 'A'.repeat(64),
        representative: testWallet.accounts[0],
      } });
    } else await route.fallback();
  });
  await seededPage.goto(`/send?account=${testWallet.accounts[0]}&to=${testWallet.accounts[2]}&amount=0.01`);
  await expect(seededPage.getByTestId('send.sourceSummary')).toContainText(testWallet.accounts[0]);
  await seededPage.getByTestId('send-address-input').fill(testWallet.accounts[2]);
  await seededPage.getByTestId('send-amount-input').fill('0.125');
  await seededPage.getByRole('button', { name: 'Change source account' }).click();
  await expect(seededPage.getByTestId('transaction.accountPicker')).toContainText('Available');
  await seededPage.locator(`button[data-account-id="${testWallet.accounts[1]}"]`).click();
  await expect(seededPage.getByTestId('send.sourceSummary')).toContainText(testWallet.accounts[1]);
  await expect(seededPage.getByTestId('send-address-input')).toHaveValue(testWallet.accounts[2]);
  await expect(seededPage.getByTestId('send-amount-input')).toHaveValue('0.125');
  await seededPage.getByRole('button', { name: 'Review payment' }).click();
  await expect(seededPage.getByRole('button', { name: 'Confirm & Send' })).toBeVisible();
  await expect(seededPage.getByRole('button', { name: 'Change source account' })).toHaveCount(0);
  await seededPage.getByRole('button', { name: 'Edit payment' }).click();
  await expect(seededPage.getByTestId('send-amount-input')).toHaveValue('0.125');
  await seededPage.getByTestId('send-amount-input').fill('0.25');
  await seededPage.getByRole('button', { name: 'Review payment' }).click();
  await expect(seededPage.getByRole('button', { name: 'Confirm & Send' })).toBeVisible();
  // Deliberately stop before signing or publishing a block.
});

test('changes receiving destination without leaving stale sharing controls or changing wallet selection', async ({ seededPage, testWallet }) => {
  await seededPage.goto(`/receive?account=${testWallet.accounts[0]}`);
  const selection = () => seededPage.evaluate(() => JSON.parse(localStorage.getItem('nanovault-wallet')!).selectedAccountId);
  const before = await selection();
  await seededPage.getByRole('button', { name: 'Change destination account' }).click();
  await expect(seededPage.getByTestId('receive.shareAddress')).toHaveCount(0);
  await expect(seededPage.getByRole('button', { name: 'Copy address', exact: true })).toHaveCount(0);
  await seededPage.locator(`button[data-account-id="${testWallet.accounts[1]}"]`).click();
  await expect(seededPage.getByTestId('receive-address-value')).toContainText(testWallet.accounts[1]);
  await seededPage.getByRole('button', { name: "All accounts' pending funds" }).click();
  await expect(seededPage.getByTestId('receive-address-value')).toContainText(testWallet.accounts[1]);
  expect(await selection()).toBe(before);
});

test('recovers from unknown explicit accounts without selecting a different account', async ({ seededPage }) => {
  for (const route of ['send', 'receive']) {
    await seededPage.goto(`/${route}?account=nano_missing`);
    await expect(seededPage.getByTestId('transaction.accountPicker')).toBeVisible();
    await expect(seededPage.getByRole('status')).toContainText('not available');
    await expect(seededPage.getByRole('button', { name: 'Review payment' })).toHaveCount(0);
    await expect(seededPage.getByRole('button', { name: 'Copy address', exact: true })).toHaveCount(0);
  }
});

for (const width of [393, 1280]) {
  test(`supports keyboard account choice and readable preparation at ${width}px`, async ({ seededPage, testWallet }, testInfo) => {
    await seededPage.setViewportSize({ width, height: 900 });
    await seededPage.goto('/send');
    const picker = seededPage.getByTestId('transaction.accountPicker');
    await expect(picker).toBeVisible();
    await expect(picker).toContainText(testWallet.accounts[1]);
    await seededPage.screenshot({ path: testInfo.outputPath(`chooser-${width}.png`), fullPage: true, animations: 'disabled' });
    const account = picker.locator(`button[data-account-id="${testWallet.accounts[1]}"]`);
    await account.focus();
    await account.press('Enter');
    await expect(seededPage.getByTestId('send.sourceSummary')).toContainText(testWallet.accounts[1]);
    await expect(seededPage.getByRole('heading', { name: 'From account', exact: true })).toBeFocused();
    const formBox = await seededPage.locator('fieldset').boundingBox();
    expect(formBox!.x + formBox!.width).toBeLessThanOrEqual(width);
    expect(await seededPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await seededPage.screenshot({ path: testInfo.outputPath(`preparation-${width}.png`), fullPage: true, animations: 'disabled' });
  });
}

test('uses the rich chooser for own-account destinations and excludes the source', async ({ seededPage, testWallet }) => {
  await seededPage.goto(`/send?account=${testWallet.accounts[0]}`);
  await seededPage.getByRole('button', { name: 'Transfer between own accounts', exact: true }).click();
  await seededPage.getByRole('button', { name: 'Choose destination account' }).click();
  const picker = seededPage.getByTestId('transaction.accountPicker');
  await expect(picker.locator(`button[data-account-id="${testWallet.accounts[0]}"]`)).toHaveCount(0);
  await picker.getByRole('button', { name: 'Back', exact: true }).click();
  await seededPage.getByRole('button', { name: 'Choose destination account' }).click();
  await seededPage.locator(`button[data-account-id="${testWallet.accounts[1]}"]`).click();
  await expect(seededPage.getByRole('button', { name: 'Change destination account' })).toBeVisible();
});

test('selects a sole account automatically but rejects an invalid explicit replacement', async ({ seededPage, testWallet }) => {
  await seededPage.addInitScript(() => {
    const wallet = JSON.parse(localStorage.getItem('nanovault-wallet')!);
    wallet.accounts = wallet.accounts.slice(0, 1);
    wallet.selectedAccountId = null;
    localStorage.setItem('nanovault-wallet', JSON.stringify(wallet));
  });
  await seededPage.goto('/send');
  await expect(seededPage.getByTestId('send.sourceSummary')).toContainText(testWallet.accounts[0]);
  await expect(seededPage.getByTestId('transaction.accountPicker')).toHaveCount(0);
  await seededPage.goto('/receive');
  await expect(seededPage.getByTestId('receive-address-value')).toContainText(testWallet.accounts[0]);
  await seededPage.goto('/receive?account=nano_missing');
  await expect(seededPage.getByTestId('transaction.accountPicker')).toBeVisible();
});

test('omits ownership actions on external account details', async ({ seededPage }) => {
  await seededPage.goto('/account/nano_377ek7uu895gbkyss6sf75ip8gddq84w3no7ur7emtn6yg65po9krfib66ni');
  await expect(seededPage.getByRole('heading', { name: 'Network Explorer' })).toBeVisible();
  await expect(seededPage.getByTestId('accountDetails.transactionActions')).toHaveCount(0);
});
