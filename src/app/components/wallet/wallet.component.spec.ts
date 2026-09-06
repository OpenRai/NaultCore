import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ClipboardModule } from 'ngx-clipboard';
import { BehaviorSubject } from 'rxjs';
import BigNumber from 'bignumber.js';
import { TranslocoRootModule } from '../../transloco/transloco-root.module';
import { AmountSplitPipe } from '../../pipes/amount-split.pipe';
import { RaiPipe } from '../../pipes/rai.pipe';
import { AppSettingsService } from '../../services/app-settings.service';
import { ApiService } from '../../services/api.service';
import { WalletContextService } from '../../services/wallet-context.service';
import { WalletService } from '../../services/wallet.service';
import { WalletComponent } from './wallet.component';

const account = {
  id: 'nano_1test',
  index: 0,
  addressBookName: 'Primary',
  balance: new BigNumber('1000000000000000000000000'),
  pending: new BigNumber(0),
  balanceRaw: new BigNumber('1000000000000000000000000'),
  pendingRaw: new BigNumber(0),
  balanceFiat: 10,
  pendingFiat: 0,
  frontier: null,
  receivePow: false,
};

function createState() {
  return {
    revision: 1,
    lifecycle: { kind: 'unlocked', type: 'seed', locked: false, configured: true },
    accounts: [account],
    selectedAccountId: account.id,
    selectedAccount: account,
    balance: account.balance,
    pending: account.pending,
    balanceRaw: account.balanceRaw,
    pendingRaw: account.pendingRaw,
    balanceFiat: account.balanceFiat,
    pendingFiat: account.pendingFiat,
    hasPending: false,
    pendingBlocks: [],
    sync: { status: 'ready' },
  } as any;
}

describe('WalletComponent', () => {
  let component: WalletComponent;
  let fixture: ComponentFixture<WalletComponent>;
  let walletState$: BehaviorSubject<any>;
  let wallet: any;

  beforeEach(async () => {
    walletState$ = new BehaviorSubject(createState());
    wallet = {
      walletState: walletState$.value,
      walletState$,
      selectedAccountState$: walletState$.asObservable(),
      getWalletAccount: vi.fn(id => walletState$.value.accounts.find(item => item.id === id)),
      selectAccount: vi.fn(),
      saveWalletExport: vi.fn(),
      isLocked: vi.fn(() => false),
      requestWalletUnlock: vi.fn(),
    };

    await TestBed.configureTestingModule({
      declarations: [WalletComponent, RaiPipe, AmountSplitPipe],
      imports: [CommonModule, FormsModule, RouterModule.forRoot([]), ClipboardModule, TranslocoRootModule],
      providers: [
        { provide: WalletService, useValue: wallet },
        WalletContextService,
        { provide: ApiService, useValue: { accountHistory: vi.fn().mockResolvedValue({ history: [] }) } },
        { provide: AppSettingsService, useValue: { settings: { displayCurrency: 'USD' } } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WalletComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('renders aggregate and selected-account context separately', () => {
    expect(fixture.nativeElement.querySelector('[data-testid="wallet-total-balance"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="wallet-selected-account"]').textContent).toContain('Primary');
    expect(fixture.nativeElement.querySelector('[data-testid="wallet-account-selector"]').value).toBe(account.id);
  });

  it('selects an account without navigating away from Wallet', () => {
    component.selectAccount(account.id);

    expect(wallet.selectAccount).toHaveBeenCalledWith(account.id);
    expect(wallet.saveWalletExport).toHaveBeenCalled();
  });

  it('creates explicit account-aware transaction navigation targets', () => {
    expect(component.selectedAccountId).toBe(account.id);
    expect(component['walletContext'].transaction('send', component.selectedAccountId)).toEqual({
      commands: ['/send'],
      queryParams: { account: account.id },
    });
  });

  it('requests unlock instead of navigating to Receive while locked', async () => {
    wallet.isLocked.mockReturnValue(true);
    wallet.requestWalletUnlock.mockResolvedValue(false);

    await component.openReceive();

    expect(wallet.requestWalletUnlock).toHaveBeenCalledOnce();
  });

});
