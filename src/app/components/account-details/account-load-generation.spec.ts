import { AccountLoadGeneration } from './account-load-generation';

describe('AccountLoadGeneration', () => {
  it('invalidates an earlier request when a different account loads', () => {
    const loads = new AccountLoadGeneration();
    const oldLoad = loads.begin('nano_old');
    const newLoad = loads.begin('nano_new');

    expect(loads.isCurrent(oldLoad, 'nano_old')).toBe(false);
    expect(loads.isCurrent(newLoad, 'nano_new')).toBe(true);
  });

  it('invalidates an earlier refresh even when the account is unchanged', () => {
    const loads = new AccountLoadGeneration();
    const oldRefresh = loads.begin('nano_account');
    const newRefresh = loads.begin('nano_account');

    expect(loads.isCurrent(oldRefresh, 'nano_account')).toBe(false);
    expect(loads.isCurrent(newRefresh, 'nano_account')).toBe(true);
  });

  it('invalidates outstanding results on component destruction', () => {
    const loads = new AccountLoadGeneration();
    const request = loads.begin('nano_account');
    loads.invalidate();

    expect(loads.isCurrent(request, 'nano_account')).toBe(false);
  });
});
