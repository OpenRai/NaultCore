/**
 * Roundtrip E2E: Send and receive XNO between own nano_ accounts.
 *
 * Prerequisites:
 *   NANO_TEST_SEED must be set in .env.test (64-char hex seed with funded accounts).
 *   If unset, all tests are skipped.
 *
 * The fixture imports the wallet and creates a second sub-account (index 1)
 * so we always have 2 nano_ accounts for transfers.
 *
 * Real on-chain Nano transactions (feeless!) — no mocks.
 */
import { test, expect } from './fixtures';

test.describe('nano_ roundtrip: send between own accounts', () => {

  test('should precompute and restore account-scoped work across reload', async ({ seededPage }) => {
    test.slow();
    const hasReadyWork = async () => seededPage.evaluate(() => {
      const raw = localStorage.getItem('nanovault-workcache');
      if (!raw) return false;
      try {
        const cache = JSON.parse(raw);
        return cache.version === 2 && cache.entries?.some((entry: any) =>
          typeof entry.account === 'string' && /^nano_/.test(entry.account) &&
          typeof entry.root === 'string' && /^[0-9A-F]{64}$/i.test(entry.root) &&
          typeof entry.work === 'string' && /^[0-9A-F]{16}$/i.test(entry.work));
      } catch {
        return false;
      }
    });

    await expect.poll(hasReadyWork, { timeout: 120000 }).toBe(true);
    const before = await seededPage.evaluate(() => localStorage.getItem('nanovault-workcache'));
    await seededPage.reload();
    await seededPage.waitForURL('**/accounts', { timeout: 30000 });
    await expect.poll(hasReadyWork, { timeout: 120000 }).toBe(true);
    const after = await seededPage.evaluate(() => localStorage.getItem('nanovault-workcache'));
    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
  });

  test('should import wallet and show funded accounts', async ({ seededPage }) => {
    await expect(seededPage).toHaveURL(/\/accounts/);

    // Fixture creates ≥2 accounts — verify both are visible
    const accountRows = seededPage.locator('[data-testid="accounts-row"]');
    const rowCount = await accountRows.count();
    expect(rowCount).toBeGreaterThanOrEqual(2);
    await expect(accountRows.first()).toContainText(/nano_/);
  });

  test('should send XNO to second account via external address', async ({ seededPage }) => {
    test.slow();

    // Get the second account's address
    await seededPage.locator('a[href="/accounts"]').click();
    const accountRows = seededPage.locator('[data-testid="accounts-row"]');
    await expect(accountRows.first()).toBeVisible({ timeout: 15000 });

    const secondAddress = await accountRows.nth(1).getAttribute('data-account-id');
    expect(secondAddress).toMatch(/^nano_[a-z0-9]{60}$/);

    // Navigate to Send
    await seededPage.locator('a[href="/send"]').click();
    await expect(seededPage.locator('[data-testid="send-page-root"]')).toBeVisible();

    await seededPage.locator('[data-testid="send-address-input"]').fill(secondAddress!.trim());
    await seededPage.locator('[data-testid="send-amount-input"]').fill('0.0001');
    await seededPage.locator('[data-testid="send-send-button"]').click();

    const confirmButton = seededPage.locator('button:has-text("Confirm & Send")');
    await expect(confirmButton).toBeVisible({ timeout: 15000 });
    await confirmButton.click();

    await seededPage.waitForTimeout(5000);
  });

  test('should transfer XNO between own accounts', async ({ seededPage }) => {
    test.slow();

    await seededPage.locator('a[href="/send"]').click();
    await expect(seededPage.locator('[data-testid="send-page-root"]')).toBeVisible();

    // Switch to "Transfer between own accounts" tab
    await seededPage.locator('text=Transfer between own accounts').click();

    const toSelect = seededPage.locator('[data-testid="transfer-to-account-input"]');
    await expect(toSelect).toBeVisible();

    // Wait for destination options to load (accounts are fetched from node)
    await expect(toSelect.locator('option')).not.toHaveCount(1, { timeout: 15000 });

    // Skip the first option (disabled placeholder "Account to transfer to")
    const options = await toSelect.locator('option:not([disabled])').all();
    expect(options.length).toBeGreaterThan(0);
    const destValue = await options[0].getAttribute('value');
    await toSelect.selectOption(destValue!);

    await seededPage.locator('[data-testid="transfer-amount-input"]').fill('0.0001');
    await seededPage.locator('[data-testid="transfer-transfer-button"]').click();

    const confirmButton = seededPage.locator('button:has-text("Confirm & Send")');
    await expect(confirmButton).toBeVisible({ timeout: 15000 });
    await confirmButton.click();

    await seededPage.waitForTimeout(5000);
  });
});
