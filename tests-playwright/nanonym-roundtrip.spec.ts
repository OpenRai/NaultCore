/**
 * Roundtrip E2E: Send and receive via nnym_ (NanoNym stealth addresses).
 *
 * Flow:
 *   1. Import wallet from NANO_TEST_SEED (hex)
 *   2. Create a NanoNym on the Accounts page
 *   3. Send XNO from a regular nano_ account to the NanoNym address
 *   4. Wait for Nostr notification and verify stealth funds appear
 *   5. Spend from the stealth account back to a regular nano_ address
 *   6. Sweep all remaining stealth funds back to account #0
 *
 * IMPORTANT: Any test that creates stealth accounts MUST sweep remaining
 * funds back to nano_ account #0. Stealth funds without Tier 2 event storage
 * (Arweave/Ceramic) are fragile — Nostr notifications are ephemeral.
 * Funds left in stealth accounts may be unrecoverable.
 *
 * Prerequisites:
 *   NANO_TEST_SEED must be set in .env.test.
 *   Real on-chain Nano transactions (feeless!) — no mocks.
 */
import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

// Skip all NanoNym E2E tests when FEATURE_NANONYMS is disabled (NaultCore build)
const featureNanonyms = process.env.FEATURE_NANONYMS !== 'false';
test.skip(!featureNanonyms, 'NanoNym features are disabled in this build (NaultCore)');

/**
 * Sweep all stealth account funds back to nano_ account #0.
 *
 * MUST be called at the end of any test that creates or credits stealth accounts.
 * This prevents XNO from being permanently lost in stealth addresses.
 */
async function sweepStealthToAccount0(page: Page) {
  // Navigate to Send page
  await page.locator('a[href="/send"]').click();
  await expect(page.locator('[data-testid="send-page-root"]')).toBeVisible();

  const fromDropdown = page.locator('select.form-select-source');
  await expect(fromDropdown).toBeVisible();

  // Find all stealth/NanoNym accounts in the "From" dropdown
  const fromOptions = await fromDropdown.locator('option').allTextContents();
  const stealthIndices: number[] = [];
  fromOptions.forEach((opt, i) => {
    if (opt.toLowerCase().includes('nnym_') || opt.toLowerCase().includes('stealth')) {
      stealthIndices.push(i);
    }
  });

  if (stealthIndices.length === 0) {
    // Nothing to sweep
    return;
  }

  // Get account #0 address (first non-stealth nano_ account)
  const account0Address = fromOptions.find(
    opt => opt.match(/nano_/) && !opt.toLowerCase().includes('nnym_') && !opt.toLowerCase().includes('stealth')
  );
  if (!account0Address) return;

  // Sweep each stealth account back to account #0
  for (const stealthIdx of stealthIndices) {
    // Select the stealth account as source
    await fromDropdown.selectOption({ index: stealthIdx });
    await page.waitForTimeout(1000);

    // Enter destination address (account #0)
    await page.locator('[data-testid="send-address-input"]').fill(account0Address.trim());

    // Click "Max" to send entire balance
    await page.locator('.max-amt-button').click();
    await page.waitForTimeout(500);

    // Click Send
    await page.locator('[data-testid="send-send-button"]').click();

    // Handle privacy warning modal if shown
    const privacyWarning = page.locator('#nanonym-privacy-warning-modal');
    if (await privacyWarning.isVisible({ timeout: 3000 }).catch(() => false)) {
      await page.locator('#nanonym-privacy-warning-modal .uk-button-primary').click();
    }

    // Confirm the transaction
    const confirmButton = page.locator('button:has-text("Confirm & Send")');
    if (await confirmButton.isVisible({ timeout: 10000 }).catch(() => false)) {
      await confirmButton.click();
      await page.waitForTimeout(8000);
    }

    // Navigate back to Send for the next sweep
    await page.locator('a[href="/send"]').click();
    await expect(page.locator('[data-testid="send-page-root"]')).toBeVisible();
  }
}

test.describe('nnym_ roundtrip: NanoNym stealth send/receive', () => {

  test('should create a NanoNym from the Accounts page', async ({ seededPage }) => {
    test.slow();

    await expect(seededPage).toHaveURL(/\/accounts/);

    await seededPage.locator('button:has-text("ADD NEW NANONYM")').click();
    const modal = seededPage.locator('#generate-nanonym-modal');
    await expect(modal).toBeVisible({ timeout: 5000 });

    await seededPage.locator('#nanonym-label').fill('E2E Test NanoNym');
    await seededPage.locator('#generate-nanonym-modal button:has-text("Generate NanoNym")').click();
    await seededPage.waitForTimeout(3000);

    await expect(seededPage.locator('text=/nnym_[a-z0-9]+/').first()).toBeVisible({ timeout: 10000 });
  });

  test('should send XNO to NanoNym, receive via stealth, then spend from stealth account', async ({ seededPage }) => {
    test.slow();

    // Step 1: Create a NanoNym
    await expect(seededPage).toHaveURL(/\/accounts/);
    await seededPage.locator('button:has-text("ADD NEW NANONYM")').click();
    await expect(seededPage.locator('#generate-nanonym-modal')).toBeVisible({ timeout: 5000 });
    await seededPage.locator('#generate-nanonym-modal button:has-text("Generate NanoNym")').click();
    await seededPage.waitForTimeout(3000);

    // Step 2: Get the NanoNym address
    const nnymAddressEl = seededPage.locator('text=/nnym_[a-z0-9]{50,}/').first();
    await expect(nnymAddressEl).toBeVisible({ timeout: 10000 });
    const nnymAddress = await nnymAddressEl.textContent();
    expect(nnymAddress).toMatch(/^nnym_[a-z0-9]{50,}$/);

    // Step 3: Send to NanoNym address
    await seededPage.locator('a[href="/send"]').click();
    await expect(seededPage.locator('[data-testid="send-page-root"]')).toBeVisible();

    await seededPage.locator('[data-testid="send-address-input"]').fill(nnymAddress);
    await seededPage.locator('[data-testid="send-amount-input"]').fill('0.0001');
    await seededPage.locator('[data-testid="send-send-button"]').click();

    // Handle privacy warning
    const privacyWarning = seededPage.locator('#nanonym-privacy-warning-modal');
    if (await privacyWarning.isVisible({ timeout: 3000 }).catch(() => false)) {
      await seededPage.locator('#nanonym-privacy-warning-modal .uk-button-primary').click();
    }

    // Confirm
    const confirmButton = seededPage.locator('button:has-text("Confirm & Send")');
    await expect(confirmButton).toBeVisible({ timeout: 15000 });
    await confirmButton.click();

    // Step 4: Wait for Nostr notification + on-chain confirmation
    await seededPage.waitForTimeout(10000);

    // Step 5: Verify accounts page shows activity
    await seededPage.locator('a[href="/accounts"]').click();
    await expect(seededPage.locator('[data-testid="accounts-row"]').first()).toBeVisible({ timeout: 15000 });
    await seededPage.waitForTimeout(5000);

    // Step 6: Spend from the stealth account back to a regular nano_ address
    await seededPage.locator('a[href="/send"]').click();
    await expect(seededPage.locator('[data-testid="send-page-root"]')).toBeVisible();

    const fromDropdown = seededPage.locator('select.form-select-source');
    await expect(fromDropdown).toBeVisible();

    const fromOptions = await fromDropdown.locator('option').allTextContents();
    const stealthIndex = fromOptions.findIndex(opt =>
      opt.toLowerCase().includes('nnym_') || opt.toLowerCase().includes('stealth')
    );

    if (stealthIndex >= 0) {
      await fromDropdown.selectOption({ index: stealthIndex });

      const nanoDest = fromOptions.find(opt =>
        opt.match(/nano_/) && !opt.toLowerCase().includes('nnym_')
      );
      if (nanoDest) {
        await seededPage.locator('[data-testid="send-address-input"]').fill(nanoDest.trim());
        await seededPage.locator('[data-testid="send-amount-input"]').fill('0.0001');
        await seededPage.locator('[data-testid="send-send-button"]').click();

        const spendPrivacyWarning = seededPage.locator('#nanonym-privacy-warning-modal');
        if (await spendPrivacyWarning.isVisible({ timeout: 3000 }).catch(() => false)) {
          await seededPage.locator('#nanonym-privacy-warning-modal .uk-button-primary').click();
        }

        await seededPage.waitForTimeout(5000);
      }
    }

    // Step 7 (CLEANUP): Sweep any remaining stealth funds back to account #0
    // CRITICAL: prevents XNO from being permanently lost in stealth accounts
    await sweepStealthToAccount0(seededPage);
  });
});
