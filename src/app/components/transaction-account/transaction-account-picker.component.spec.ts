import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import BigNumber from 'bignumber.js';
import { AppSettingsService } from '../../services/app-settings.service';
import { SpendableAccount } from '../../types/spendable-account.types';
import { TransactionAccountPickerComponent } from './transaction-account-picker.component';

describe('TransactionAccountPickerComponent', () => {
  beforeEach(() => TestBed.configureTestingModule({
    imports: [TransactionAccountPickerComponent],
    providers: [provideRouter([]), { provide: AppSettingsService, useValue: { settings: { identiconsStyle: 'none' } } }],
  }));

  it('shows full identity, available and pending separately, and selects without dropping empty accounts', async () => {
    const fixture = TestBed.createComponent(TransactionAccountPickerComponent);
    fixture.componentRef.setInput('accounts', [
      { type: 'regular', id: 'nano_full_address_A', index: 0, label: 'Daily spending', balance: new BigNumber('1e30'), pending: new BigNumber('2e30') },
      { type: 'regular', id: 'nano_full_address_B', index: 5, label: 'Savings', balance: new BigNumber(0), pending: new BigNumber(0) },
    ] as SpendableAccount[]);
    fixture.componentRef.setInput('selectedId', 'nano_full_address_B');
    const selected = vi.fn();
    fixture.componentInstance.accountSelected.subscribe(selected);
    await fixture.whenStable();
    const rows = fixture.nativeElement.querySelectorAll('button[data-account-id]');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('Daily spending');
    expect(rows[0].textContent).toContain('Account #0');
    expect(rows[0].textContent).toContain('nano_full_address_A');
    expect(rows[0].textContent).toContain('Available: 1 XNO');
    expect(rows[0].textContent).toContain('Pending: 2 XNO (not yet available)');
    expect(rows[1].getAttribute('aria-current')).toBe('true');
    rows[1].click();
    expect(selected).toHaveBeenCalledWith('nano_full_address_B');
  });

  it('searches account names, indices and addresses and excludes the transfer source', async () => {
    const fixture = TestBed.createComponent(TransactionAccountPickerComponent);
    fixture.componentRef.setInput('accounts', [
      { type: 'regular', id: 'nano_A', index: 0, label: 'Daily', balance: new BigNumber(0), pending: new BigNumber(0) },
      { type: 'regular', id: 'nano_B', index: 8, label: 'Savings', balance: new BigNumber(0), pending: new BigNumber(0) },
    ] as SpendableAccount[]);
    fixture.componentRef.setInput('excludeId', 'nano_A');
    await fixture.whenStable();
    for (const query of ['savings', '#8', 'nano_B']) {
      fixture.componentInstance.search = query;
      expect(fixture.componentInstance.filteredAccounts.map(account => account.id)).toEqual(['nano_B']);
    }
    const input = fixture.nativeElement.querySelector('input');
    input.value = 'missing';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('No matching accounts');
  });

  it('provides a recovery route when there are no accounts', async () => {
    const fixture = TestBed.createComponent(TransactionAccountPickerComponent);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('a').getAttribute('href')).toBe('/accounts');
    expect(fixture.nativeElement.textContent).toContain('No accounts are available');
  });
});
