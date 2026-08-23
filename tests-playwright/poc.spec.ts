import { test, expect } from './fixtures';

test('basic app load and navigation check', async ({ seededPage }) => {
  const page = seededPage;
  await expect(page).toHaveTitle(/NaultCore/);
  
  await expect(page.getByText('Loading NanoNyms...')).not.toBeVisible({ timeout: 15000 });
  await expect(page.locator('[data-testid="accounts-page-root"]')).toBeVisible();
});

test('closed mobile navigation stays fully off-canvas', async ({ seededPage }) => {
  const page = seededPage;
  await page.setViewportSize({ width: 800, height: 900 });

  const navigation = page.locator('.nav-container');
  await expect.poll(() => navigation.evaluate(element => element.getBoundingClientRect().right)).toBeLessThanOrEqual(0);

  await page.locator('.mobile-top-bar .nav-button').click();
  await expect.poll(() => navigation.evaluate(element => element.getBoundingClientRect().left)).toBe(0);
});
