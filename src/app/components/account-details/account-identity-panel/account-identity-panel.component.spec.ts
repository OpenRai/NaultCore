import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AccountIdentityPanelComponent } from './account-identity-panel.component';

describe('AccountIdentityPanelComponent', () => {
  let fixture: ComponentFixture<AccountIdentityPanelComponent>;
  let component: AccountIdentityPanelComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AccountIdentityPanelComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(AccountIdentityPanelComponent);
    component = fixture.componentInstance;
    component.accountID = 'nano_test';
    component.displayLabel = 'Savings';
    component.typeLabel = 'Account #2';
    component.editLabel = 'Edit';
    component.copyLabel = 'Copy';
    component.showQrLabel = 'Show QR code';
    fixture.detectChanges();
  });

  it('renders the account identity and exposes edit, copy, and QR actions', () => {
    expect(fixture.nativeElement.querySelector('.account-type-label').textContent.trim()).toBe('Account #2');
    expect(fixture.nativeElement.querySelector('h3').textContent.trim()).toBe('Savings');
    expect(fixture.nativeElement.querySelector('app-nano-account-id')).toBeTruthy();

    let editing: boolean | undefined;
    let copied = false;
    let showQr = false;
    component.editingChange.subscribe(value => editing = value);
    component.copied.subscribe(() => copied = true);
    component.showQr.subscribe(() => showQr = true);

    fixture.nativeElement.querySelector('[uk-icon="icon: pencil;"]').click();
    fixture.nativeElement.querySelector('.icon-qr-code').click();
    component.onCopySuccess();

    expect(editing).toBe(true);
    expect(showQr).toBe(true);
    expect(copied).toBe(true);
  });

  it('shows the editable value and emits model and save intents', () => {
    fixture.componentRef.setInput('editing', true);
    fixture.componentRef.setInput('model', 'New label');
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('New label');

    let model = '';
    let saved = false;
    component.modelChange.subscribe(value => model = value);
    component.save.subscribe(() => saved = true);
    input.value = 'Updated label';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter' }));
    fixture.detectChanges();

    expect(model).toBe('Updated label');
    expect(saved).toBe(true);
  });

  it('hides the identicon when the setting disables it and permits an empty account type label', () => {
    fixture.componentRef.setInput('iconStyle', 'none');
    fixture.componentRef.setInput('typeLabel', '');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-nano-identicon')).toBeNull();
    expect(fixture.nativeElement.querySelector('.account-type-label')).toBeNull();
  });
});
