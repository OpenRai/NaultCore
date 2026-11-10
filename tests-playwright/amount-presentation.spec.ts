import { test, expect } from './fixtures';

for (const width of [393, 1280]) {
  test(`simplifies tiny transaction headers and copies exact XNO from block details at ${width}px`, async ({ seededPage, testWallet }) => {
    await seededPage.setViewportSize({ width, height: 900 });
    await seededPage.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await seededPage.route('**/*', async route => {
      let action: string | undefined;
      try { action = route.request().postDataJSON()?.action; } catch { /* not RPC */ }
      if (action !== 'blocks_info') return route.fallback();
      await route.fulfill({ json: { blocks: { ['B'.repeat(64)]: {
        block_account: testWallet.accounts[0], amount: '86118708102050',
        confirmed: 'true', height: '1', local_timestamp: '1700000000',
        contents: JSON.stringify({ type: 'send', balance: '0', previous: 'A'.repeat(64), destination: testWallet.accounts[1] }),
      } } } });
    });
    await seededPage.goto(`/transaction/${'B'.repeat(64)}`);
    const summary = seededPage.locator('.block-amount-primary');
    await expect(summary).toHaveText('<0.000001 XNO');
    await expect(summary.getByTestId('nano-amount-raw-remainder')).toHaveCount(0);
    const exact = '0.00000000000000008611870810205';
    await expect(seededPage.getByTestId('transaction-exact-xno')).toHaveValue(exact);
    await seededPage.getByTestId('transaction-copy-exact-xno').click();
    expect(await seededPage.evaluate(() => navigator.clipboard.readText())).toBe(exact);
  });
}
