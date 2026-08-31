import { NanoAccountIdComponent } from './nano-account-id.component';

const skippedDescribe = (globalThis as any).xdescribe ?? (describe as any).skip;
const featureDescribe = FEATURE_NANONYMS ? describe : skippedDescribe;

describe('NanoAccountIdComponent', () => {
  let component: NanoAccountIdComponent;

  beforeEach(() => {
    component = new NanoAccountIdComponent();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should detect nano_ addresses as regular Nano type', () => {
    const nanoAddress = 'nano_3iwi45me3cgo9aza9wx5f7rder37hw11xtc1ek8psqxw5oxb8cujjad6qp9y';
    component.accountID = nanoAddress;
    component.ngOnChanges();

    expect(component.isNanoNymAddress).toBe(false);
  });

  it('should extract the account prefix characters for Nano addresses', () => {
    const nanoAddress = 'nano_3iwi45me3cgo9aza9wx5f7rder37hw11xtc1ek8psqxw5oxb8cujjad6qp9y';
    component.accountID = nanoAddress;
    component.ngOnChanges();

    expect(component.firstCharacters).toBe('3iwi4');
  });

  it('should handle middle modes for Nano addresses', () => {
    const nanoAddress = 'nano_3iwi45me3cgo9aza9wx5f7rder37hw11xtc1ek8psqxw5oxb8cujjad6qp9y';

    component.accountID = nanoAddress;
    component.middle = 'auto';
    component.ngOnChanges();
    expect(component.classes).toBe('uk-flex');
    expect(component.middleCharacters).toBeTruthy();

    component.middle = 'off';
    component.ngOnChanges();
    expect(component.middleCharacters).toBe('');

    component.middle = 'on';
    component.ngOnChanges();
    expect(component.middleCharacters).toBeTruthy();

    component.middle = 'break';
    component.ngOnChanges();
    expect(component.classes).toBe('nano-address-breakable');
  });

  featureDescribe('NanoNym address detection', () => {
    it('should detect nnym_ addresses as NanoNym type', () => {
      const nnymAddress = 'nnym_17jxt55u9s3rusu5qbm8bfjmmqgpucne4pkudohq3rsy4wow5ptszdwfju6meyqzr71judrhrghrf3z3hn9ssiyurfq13jnduosek8at1yahc8pkdgouhrtnxh8mzd6ngnxx6134hzqebiorqazba47grpmubyi';
      component.accountID = nnymAddress;
      component.ngOnChanges();

      expect(component.isNanoNymAddress).toBe(true);
    });

    it('should extract correct prefix for NanoNym addresses', () => {
      const nnymAddress = 'nnym_17jxt55u9s3rusu5qbm8bfjmmqgpucne4pkudohq3rsy4wow5ptszdwfju6meyqzr71judrhrghrf3z3hn9ssiyurfq13jnduosek8at1yahc8pkdgouhrtnxh8mzd6ngnxx6134hzqebiorqazba47grpmubyi';
      component.accountID = nnymAddress;
      component.ngOnChanges();

      // Should extract first 5 chars after nnym_ prefix
      expect(component.firstCharacters).toBe('17jxt');
    });

    it('should handle middle modes for NanoNym addresses', () => {
      const nnymAddress = 'nnym_17jxt55u9s3rusu5qbm8bfjmmqgpucne4pkudohq3rsy4wow5ptszdwfju6meyqzr71judrhrghrf3z3hn9ssiyurfq13jnduosek8at1yahc8pkdgouhrtnxh8mzd6ngnxx6134hzqebiorqazba47grpmubyi';

      component.accountID = nnymAddress;
      component.middle = 'auto';
      component.ngOnChanges();
      expect(component.classes).toBe('uk-flex');
      expect(component.middleCharacters).toBeTruthy();
      expect(component.isNanoNymAddress).toBe(true);

      component.middle = 'break';
      component.ngOnChanges();
      expect(component.classes).toBe('nano-address-breakable');
      expect(component.middleCharacters).toBeTruthy();
      expect(component.isNanoNymAddress).toBe(true);
    });
  });
});
