import { test, expect, unlockWalletThroughBridge } from './fixtures';

type HistoryRow = {
  hash: string;
  subtype: 'receive' | 'send';
  amount: string;
  account: string;
  link_as_account: string;
  local_timestamp: string;
  height: string;
};

test('uses Accounts as the first menu entry and the balance card as the dashboard link', async ({ seededPage }) => {
  const navigation = seededPage.getByRole('navigation', { name: 'Main', exact: true });
  await expect(navigation.locator('ul.left-nav > li').first().getByRole('link')).toHaveText('Accounts');
  await expect(navigation.locator('a[href="/wallet"]')).toHaveCount(0);

  const quickReceive = seededPage.getByTestId('quick-receive-button');
  await quickReceive.click();
  await expect(seededPage.getByTestId('quick-receive-menu')).toBeVisible();
  await expect(seededPage).toHaveURL(/\/accounts$/);
  await quickReceive.click();

  const dashboard = seededPage.getByTestId('wallet-dashboard-link');
  const bounds = await dashboard.boundingBox();
  expect(bounds).not.toBeNull();
  await dashboard.click({ position: { x: bounds!.width - 15, y: bounds!.height - 15 } });
  await expect(seededPage).toHaveURL(/\/wallet$/);
  await expect(seededPage.getByTestId('wallet-page-root')).toBeVisible();

  await navigation.getByRole('link', { name: 'Accounts', exact: true }).click();
  await expect(seededPage.getByTestId('accounts-page-root')).toBeVisible();
  await dashboard.focus();
  await seededPage.keyboard.press('Enter');
  await expect(seededPage).toHaveURL(/\/wallet$/);
});

function historyRow(hash: string, account: string, timestamp: number): HistoryRow {
  return {
    hash,
    subtype: 'receive',
    amount: '1000000000000000000000000',
    account: 'nano_1counterparty',
    link_as_account: account,
    local_timestamp: String(timestamp),
    height: String(timestamp),
  };
}

test('shows loading instead of zero while startup balance reconciliation is pending', async ({ page, testWallet }) => {
  let releaseBalances!: () => void;
  const balancesGate = new Promise<void>(resolve => { releaseBalances = resolve; });

  await page.route('**/*', async route => {
    const request = route.request();
    if (request.method() === 'POST' && request.postDataJSON()?.action === 'accounts_balances') {
      await balancesGate;
    }
    await route.fallback();
  });

  await page.goto('/wallet');
  await expect(page.getByTestId('wallet-page-root')).toBeVisible();
  await expect(page.locator('.balance-int[role="status"]')).toHaveText('Loading…');

  releaseBalances();
  const balance = page.locator('[data-testid="wallet-summary-card"] .summary-primary app-nano-amount');
  await expect(balance.getByTestId('nano-amount-summary')).toHaveText('0 XNO');
});

test('shows a numeric one-raw preview and links through to account details', async ({ seededPage, testWallet }) => {
  await seededPage.goto('/configure-app');
  const minimumReceive = seededPage.locator('#form-horizontal-text4');
  await minimumReceive.fill('');
  await minimumReceive.blur();

  await seededPage.route('**/*', async route => {
    const request = route.request();
    if (request.method() === 'POST') {
      let body: { action?: string; accounts?: string[] } = {};
      try { body = request.postDataJSON(); } catch { /* use the configured mock */ }
      if (body.action === 'accounts_balances' && body.accounts) {
        await route.fulfill({ json: { balances: Object.fromEntries(body.accounts.map(account => [account, {
          balance: account === testWallet.accounts[0] ? '1' : '0',
          pending: '0',
        }])) } });
        return;
      }
    }
    await route.fallback();
  });

  await seededPage.goto('/wallet');
  await seededPage.evaluate(async () => { await (window as any).__NAULTCORE_E2E__.refreshWallet(); });
  const balance = seededPage.locator('[data-testid="wallet-summary-card"] .summary-primary app-nano-amount');
  await expect(balance.getByTestId('nano-amount-summary')).toHaveText('1 × 10⁻³⁰ XNO');
  await expect(balance.locator('details')).toHaveCount(0);
  await balance.getByRole('link').click();
  await expect(seededPage).toHaveURL(/\/accounts$/);
  await seededPage.locator(`[data-testid="accounts-row"][data-account-id="${testWallet.accounts[0]}"]`)
    .locator('[data-testid="nano-amount-summary"]:visible').first().click();
  await expect(seededPage).toHaveURL(new RegExp(`/account/${testWallet.accounts[0]}$`));
});

test('keeps identity card fiat visible unless currency is None and fits dashboard previews', async ({ seededPage }) => {
  await seededPage.goto('/configure-app');
  const currency = seededPage.getByLabel('FIAT Currency', { exact: true });
  const fiat = seededPage.getByTestId('total-balance-fiat-card');
  await currency.selectOption('USD');
  await expect(fiat).toContainText('$');
  await expect(fiat).not.toContainText('≈');
  await currency.selectOption('');
  await expect(fiat).toHaveCount(0);
  await currency.selectOption('EUR');
  await expect(fiat).toContainText('€');

  await seededPage.goto('/wallet');
  await expect(seededPage.locator('.wallet-account-count')).toHaveText('Across 3 accounts');
  await expect(seededPage.locator('details.amount-details')).toHaveCount(0);
  for (const width of [1280, 390]) {
    await seededPage.setViewportSize({ width, height: 900 });
    const balance = seededPage.locator('.balance-display-wrap');
    await expect.poll(() => balance.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  }
});

test('shows cached activity while fetching, then refreshes it after wallet reconciliation', async ({ seededPage, testWallet }) => {
  const cachedRow = historyRow('cached-history-hash', testWallet.accounts[0], 1700000000);
  const newlyRegisteredRow = historyRow('newly-registered-history-hash', testWallet.accounts[0], 1700000001);

  await seededPage.evaluate(async ({ accounts, row }) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('naultcore-transaction-history', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('history', { keyPath: 'accountId' });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction('history', 'readwrite');
        accounts.forEach((accountId, index) => transaction.objectStore('history').put({
          accountId,
          rows: index === 0 ? [row] : [],
        }));
        transaction.oncomplete = () => { db.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
    });
  }, { accounts: testWallet.accounts, row: cachedRow });

  let currentRows = [cachedRow];
  let releaseFirstHistoryRequest!: () => void;
  const firstHistoryGate = new Promise<void>(resolve => { releaseFirstHistoryRequest = resolve; });
  let holdFirstHistoryRequest = true;

  await seededPage.route('**/*', async route => {
    const request = route.request();
    if (request.method() === 'POST') {
      let body: { action?: string; account?: string } = {};
      try { body = request.postDataJSON(); } catch { /* fall through to the configured mock */ }
      if (body.action === 'account_history') {
        if (body.account === testWallet.accounts[0] && holdFirstHistoryRequest) {
          holdFirstHistoryRequest = false;
          await firstHistoryGate;
        }
        await route.fulfill({ json: { history: body.account === testWallet.accounts[0] ? currentRows : [] } });
        return;
      }
    }
    await route.fallback();
  });

  await seededPage.goto('/wallet');
  await expect(seededPage.getByTestId('wallet-page-root')).toBeVisible();
  const cachedLink = seededPage.getByTestId('transaction-table-hash-link').filter({ hasText: cachedRow.hash });
  await expect(cachedLink).toBeVisible();
  await expect(seededPage.getByTestId('transaction-table-loading')).toBeHidden();

  releaseFirstHistoryRequest();
  currentRows = [cachedRow, newlyRegisteredRow];
  await seededPage.evaluate(async () => {
    await (window as any).__NAULTCORE_E2E__.refreshWallet();
  });

  await expect(
    seededPage.getByTestId('transaction-table-hash-link').filter({ hasText: newlyRegisteredRow.hash }),
  ).toBeVisible();
});

test('selects the actual newly added account when opening Receive from its account row', async ({ seededPage }) => {
  const rows = seededPage.getByTestId('accounts-row');
  await expect(rows).toHaveCount(3);

  await seededPage.getByTestId('accounts-create-account-button').click();
  await expect(rows).toHaveCount(4, { timeout: 15000 });
  const newAccountRow = rows.nth(3);
  const newAccountId = await newAccountRow.getAttribute('data-account-id');
  expect(newAccountId).toBeTruthy();

  await newAccountRow.getByTestId('receive-account-button').click();
  await expect(seededPage).toHaveURL(new RegExp(`/receive\\?account=${newAccountId}$`));
  await expect(seededPage.getByRole('combobox', { name: 'Account' })).toHaveValue(newAccountId!);
  await expect(seededPage.getByTestId('receive-address-value')).toContainText(newAccountId!);
});
