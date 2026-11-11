import { test, expect } from './fixtures';

for (const width of [393, 1280]) {
  test(`uses consistent typography across wallet pages at ${width}px`, async ({ seededPage, testWallet }, testInfo) => {
    await seededPage.setViewportSize({ width, height: 900 });
    for (const route of ['wallet', 'accounts', 'send', 'receive', 'configure-app']) {
      await seededPage.goto(`/${route}${['send', 'receive'].includes(route) ? `?account=${testWallet.accounts[0]}` : ''}`);
      const breadcrumbPage = ['send', 'receive'].includes(route);
      const heading = breadcrumbPage
        ? seededPage.getByRole('navigation', { name: 'Breadcrumb', exact: true }).locator('[aria-current="page"]')
        : seededPage.locator('.content-container h2').first();
      await expect(heading).toBeVisible();
      await expect(heading).toHaveCSS('font-family', /Montserrat/);
      await expect(heading).toHaveCSS('font-size', breadcrumbPage ? '20px' : '32px');
      if (breadcrumbPage) await expect(seededPage.locator('.content-container h2.uk-heading-divider')).toHaveCount(0);
      const button = seededPage.locator('.content-container .uk-button:visible').first();
      await expect(button).toHaveCSS('font-family', /Open Sans/);
      await expect(button).toHaveCSS('font-size', '14px');
      const label = seededPage.locator('.content-container .uk-form-label:visible').first();
      if (await label.count()) await expect(label).toHaveCSS('font-family', /Open Sans/);
      if (route === 'send') {
        await expect(seededPage.locator('.nano-address-monospace').first()).toHaveCSS('font-family', /Roboto Mono/);
        await expect(seededPage.getByTestId('send-amount-input')).toHaveCSS('font-family', /Open Sans/);
      }
      const fontsLoaded = await seededPage.evaluate(async () => {
        for (const family of ['Montserrat', 'Open Sans']) {
          for (const weight of family === 'Montserrat' ? [500, 600, 700] : [400, 600, 700]) {
            await document.fonts.load(`${weight} 16px "${family}"`, 'Wallet balance');
            if (!document.fonts.check(`${weight} 16px "${family}"`, 'Wallet balance')) return false;
          }
        }
        return true;
      });
      expect(fontsLoaded).toBe(true);
      await seededPage.screenshot({ path: testInfo.outputPath(`${route}-${width}.png`), fullPage: true, animations: 'disabled' });
    }
  });
}
