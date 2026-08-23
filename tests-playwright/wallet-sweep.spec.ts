import { test, expect } from '@playwright/test';

const EMPTY_SOURCE_SEED = '0000000000000000000000000000000000000000000000000000000000000001';
const CUSTOM_DESTINATION = 'nano_1111111111111111111111111111111111111111111111111111hifc8npp';

test('sweeps a source wallet through the full UI flow', async ({ page }) => {
  test.slow();

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

    if (action === 'account_info') {
      await route.fulfill({ json: { error: 'Account not found' } });
      return;
    }
    if (action === 'receivable' || action === 'pending') {
      await route.fulfill({ json: { blocks: '' } });
      return;
    }
    await route.continue();
  });

  await page.goto('/sweeper');
  await expect(page.getByTestId('sweeper-page-root')).toBeVisible();

  await page.locator('#destination-account').selectOption('0');
  await page.locator('#custom-destination').fill(CUSTOM_DESTINATION);
  await page.getByTestId('sweeper-source-wallet-input').fill(EMPTY_SOURCE_SEED);
  await page.getByTestId('sweeper-start-index-input').fill('0');
  await page.getByTestId('sweeper-end-index-input').fill('0');
  await page.getByTestId('sweeper-max-incoming-input').fill('0');
  await page.getByTestId('sweeper-start-button').click();

  const confirmation = page.locator('.uk-modal.uk-open');
  await expect(confirmation).toContainText('You are about to empty the source wallet');
  await confirmation.getByRole('button', { name: /ok/i }).click();

  await expect(page.getByTestId('sweeper-processing-button')).toBeVisible();
  await expect(page.getByTestId('sweeper-output')).toHaveValue(
    /Finished processing all accounts[\s\S]*Ӿ0 transferred/,
    { timeout: 30_000 },
  );
  await expect(page.getByTestId('sweeper-start-button')).toBeVisible();
});
