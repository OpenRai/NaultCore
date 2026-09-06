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

test('keeps navigation destinations separate from transaction actions', async ({ seededPage }) => {
  const page = seededPage;
  const navigation = page.locator('.nav-container');
  const primaryNavigation = page.getByRole('navigation', { name: 'Main' });

  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(navigation).not.toHaveAttribute('aria-hidden', 'true');
  await expect(primaryNavigation.getByRole('link', { name: 'Wallet', exact: true })).toBeVisible();
  await expect(primaryNavigation.getByRole('link', { name: 'Accounts', exact: true })).toBeVisible();
  await expect(primaryNavigation.getByRole('link', { name: 'Send', exact: true })).toHaveCount(0);
  await expect(primaryNavigation.getByRole('link', { name: 'Receive', exact: true })).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  const navToggle = page.locator('.mobile-top-bar .nav-button');
  await expect(navToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(navigation).toHaveAttribute('aria-hidden', 'true');
  await expect(navigation).toHaveAttribute('inert', '');

  await navToggle.click();
  await expect(navToggle).toHaveAttribute('aria-expanded', 'true');
  await expect(navigation).not.toHaveAttribute('aria-hidden', 'true');
  await expect(navigation).not.toHaveAttribute('inert');

  await page.keyboard.press('Escape');
  await expect(navToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(navigation).toHaveAttribute('aria-hidden', 'true');
});
