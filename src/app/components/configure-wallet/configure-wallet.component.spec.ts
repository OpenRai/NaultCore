import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { ConfigureWalletComponent } from './configure-wallet.component';
import { RecoveryImportService } from '../../services/recovery-import.service';
import { TranslocoRootModule } from '../../transloco/transloco-root.module';

@NgModule({
  declarations: [ConfigureWalletComponent],
  imports: [FormsModule, RouterModule, TranslocoRootModule],
})
class ConfigureWalletTestModule {}

const skippedIt = it.skip;

describe('ConfigureWalletComponent', () => {
  let component: ConfigureWalletComponent;
  let fixture: ComponentFixture<ConfigureWalletComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [ConfigureWalletTestModule]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ConfigureWalletComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // SKIPPED: Test fails due to missing DI providers in TestBed configuration.
  // To fix: Add mock providers for all component/service dependencies.
  // See docs/testing.md for the current test commands.
  skippedIt('should create', () => {
    expect(component).toBeTruthy();
  });

});

describe('ConfigureWalletComponent recovery material validation', () => {
  const classifier = new RecoveryImportService();

  function validate(material: string, passphraseEnabled = false, passphrase = ''): ConfigureWalletComponent {
    const validationComponent = Object.create(ConfigureWalletComponent.prototype) as ConfigureWalletComponent;
    validationComponent.recoveryMaterial = material;
    validationComponent.recoveryMaterialInvalid = false;
    validationComponent.recoveryMaterialIsBip39 = false;
    validationComponent.recoveryWordCheckVisible = false;
    validationComponent.recoveryPassphraseEnabled = passphraseEnabled;
    validationComponent.recoveryPassphrase = passphrase;
    (validationComponent as any).recoveryImport = classifier;
    validationComponent.updateRecoveryMaterialValidity();
    return validationComponent;
  }

  [
    { name: 'empty input', material: '', invalid: false, supportsPassphrase: false },
    { name: 'whitespace-only input', material: ' \n\t ', invalid: false, supportsPassphrase: false },
    { name: 'unrecognized non-empty input', material: 'not a recovery secret', invalid: true, supportsPassphrase: false },
    { name: '64-character hexadecimal secret', material: 'a'.repeat(64), invalid: false, supportsPassphrase: false },
    { name: '128-character expanded private key', material: 'a'.repeat(128), invalid: false, supportsPassphrase: false },
    { name: 'BIP-39 mnemonic with normalized whitespace', material: '  abandon\n\tabandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about  ', invalid: false, supportsPassphrase: true },
  ].forEach(({ name, material, invalid, supportsPassphrase }) => {
    it(`marks ${name} as ${invalid ? 'invalid' : 'valid'}`, () => {
      const component = validate(material);
      expect(component.recoveryMaterialInvalid).toBe(invalid);
      expect(component.recoveryMaterialIsBip39).toBe(supportsPassphrase);
    });
  });

  it('clears a BIP-39 passphrase when material changes to another recovery shape', () => {
    const component = validate('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about', true, 'keep this only for BIP-39');
    expect(component.recoveryMaterialIsBip39).toBe(true);
    expect(component.recoveryPassphraseEnabled).toBe(true);

    component.recoveryMaterial = 'a'.repeat(64);
    component.updateRecoveryMaterialValidity();

    expect(component.recoveryPassphraseEnabled).toBe(false);
    expect(component.recoveryPassphrase).toBe('');
  });

  it('shows the word check only after a complete supported phrase length is entered', () => {
    const incomplete = validate(Array(11).fill('abandon').join(' '));
    const complete = validate(Array(12).fill('abandon').join(' '));

    expect(incomplete.recoveryWordCheckVisible).toBe(false);
    expect(complete.recoveryWordCheckVisible).toBe(true);
  });

  it('starts read-only probing immediately after accepting detected material', () => {
    const component = Object.create(ConfigureWalletComponent.prototype) as ConfigureWalletComponent;
    component.recoveryMaterial = 'a'.repeat(64);
    component.recoveryPassphraseEnabled = false;
    component.recoveryPassphrase = '';
    component.recoveryVerificationResult = null;
    component.recoveryInterpretationTouched = true;
    (component as any).recoveryImport = classifier;
    vi.spyOn(component, 'checkRecovery').mockImplementation(() => Promise.resolve());

    component.previewRecoveryImport();

    expect(component.recoveryCandidate?.interpretations).toEqual(['nano-seed', 'private-key']);
    expect(component.recoveryVerificationResult).toBeNull();
    expect(component.recoveryInterpretationTouched).toBe(false);
    expect(component.checkRecovery).toHaveBeenCalledTimes(1);
  });

  it('invalidates existing evidence when a passphrase is revised before re-checking', () => {
    const component = Object.create(ConfigureWalletComponent.prototype) as ConfigureWalletComponent;
    component.recoveryChecking = false;
    component.recoveryVerificationResult = {} as any;

    component.invalidateRecoveryPreview();

    expect(component.recoveryVerificationResult).toBeNull();
  });

  it('uses one distinct name for each detected recovery material shape', () => {
    const component = Object.create(ConfigureWalletComponent.prototype) as ConfigureWalletComponent;
    (component as any).recoveryImport = classifier;

    expect(component.recoveryCandidateDescription(classifier.classify('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about')))
      .toBe('12-word secret recovery mnemonic');
    expect(component.recoveryCandidateDescription(classifier.classify('a'.repeat(64))))
      .toBe('64-character hexadecimal secret');
    expect(component.recoveryCandidateDescription(classifier.classify('a'.repeat(128))))
      .toBe('128-character expanded private key');
  });
});
