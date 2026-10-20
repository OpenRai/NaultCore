import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ClipboardModule } from 'ngx-clipboard';
import { BehaviorSubject } from 'rxjs';
import BigNumber from 'bignumber.js';
import { AmountSplitPipe } from '../../pipes/amount-split.pipe';
import { RaiPipe } from '../../pipes/rai.pipe';
import { TranslocoService } from '@jsverse/transloco';
import { TranslocoRootModule } from '../../transloco/transloco-root.module';
import { AppSettingsService } from '../../services/app-settings.service';
import { WalletContextService } from '../../services/wallet-context.service';
import { WalletService } from '../../services/wallet.service';
import { NotificationService } from '../../services/notification.service';
import { TransactionHistoryService } from '../../services/transaction-history.service';
import { WalletComponent } from './wallet.component';
import { TransactionTableComponent } from '../transaction-table/transaction-table.component';

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


/** Rows the stubbed history service hands back, keyed by account id. */
let historyRowsFor: Record<string, any[]> = {};

/** Stubbed history service driven by `historyRowsFor`. */
function makeHistoryStub() {
  return {
    rowsForAccounts: vi.fn(async (ids: string[]) => {
      const map = new Map<string, any[]>();
      for (const id of ids) map.set(id, historyRowsFor[id] ?? []);
      return map;
    }),
    cachedRowsForAccounts: vi.fn(async (ids: string[]) => {
      const map = new Map<string, any[]>();
      for (const id of ids) map.set(id, historyRowsFor[id] ?? []);
      return map;
    }),
    toTransactions: vi.fn((rows: any[], accountId: string, label: string) =>
      rows.map((row: any) => toTransaction(row, accountId, label))),
  };
}

function toTransaction(row: any, accountId: string, label: string) {
  return {
    hash: row.hash,
    accountId,
    accountLabel: label,
    direction: row.subtype === 'send' ? ('sent' as const) : ('received' as const),
    amount: new BigNumber(row.amount || 0).abs(),
    counterparty: row.link_as_account ?? row.account ?? null,
    counterpartyLabel: null,
    timestamp: row.local_timestamp ? Number(row.local_timestamp) : null,
    status: 'confirmed' as const,
    height: null,
  };
}

/**
 * A declared NgModule, not TestBed.configureTestingModule({declarations}).
 * The unit-test builder resolves template scope from a real module, which is
 * what lets WalletComponent see <app-transaction-table>.
 */
@NgModule({
  declarations: [WalletComponent, TransactionTableComponent],
  imports: [CommonModule, FormsModule, RouterModule.forRoot([]), TranslocoRootModule, ClipboardModule],
})
class WalletTestModule {}

describe('WalletComponent', () => {
  let component: WalletComponent;
  let fixture: ComponentFixture<WalletComponent>;
  let walletState$: BehaviorSubject<any>;
  let wallet: any;

  beforeEach(async () => {
    walletState$ = new BehaviorSubject(createState());
    historyRowsFor = {};
    wallet = {
      walletState: walletState$.value,
      walletState$,
      selectedAccountState$: walletState$.asObservable(),
      getWalletAccount: vi.fn((id: string) => walletState$.value.accounts.find((item: any) => item.id === id)),
      selectAccount: vi.fn(),
      saveWalletExport: vi.fn(),
      isLocked: vi.fn(() => false),
      requestWalletUnlock: vi.fn(),
      hasPassword: vi.fn(() => false),
      canEnrollPasskey: false,
      getPasskeyCredentials: vi.fn(() => []),
      enablePasskeyUnlock: vi.fn(async () => false),
    };

    await TestBed.configureTestingModule({
      declarations: [RaiPipe, AmountSplitPipe],
      imports: [WalletTestModule],
      providers: [
        { provide: WalletService, useValue: wallet },
        { provide: NotificationService, useValue: { sendSuccess: vi.fn(), sendWarning: vi.fn() } },
        WalletContextService,
        { provide: TransactionHistoryService, useValue: makeHistoryStub() },
        { provide: AppSettingsService, useValue: { settings: { displayCurrency: 'USD' } } },
        {
          provide: TranslocoService,
          useValue: { translate: (key: string, params?: any) => params?.time ? `${key}:${params.time}` : (params ? `${key}:${JSON.stringify(params)}` : key) },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WalletComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('shows the wallet total and links out to the Accounts page instead of listing accounts', () => {
    fixture.detectChanges();
    const el = fixture.nativeElement;

    expect(el.querySelector('[data-testid="wallet-total-balance"]')).toBeFalsy();
    expect(el.querySelector('[data-testid="wallet-summary-card"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="wallet-accounts-link"]')).toBeTruthy();
    // The account list that used to live here is gone; the Accounts page owns it.
    expect(el.querySelector('.accounts-collection')).toBeFalsy();
    expect(el.querySelector('.account-row-item')).toBeFalsy();
  });

  it('renders the unified transaction table instead of a tabbed panel', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="transaction-table-root"]')).toBeTruthy();
    // The Accounts/Recent Activity tab switcher is gone.
    expect(fixture.nativeElement.querySelector('.wallet-tabs-bar')).toBeFalsy();
  });

  it('keeps the account selector in the action bar for Send and Receive context', () => {
    fixture.detectChanges();
    const selector = fixture.nativeElement.querySelector('[data-testid="wallet-account-selector"]');
    const actionBar = fixture.nativeElement.querySelector('.wallet-action-bar');

    expect(selector).toBeTruthy();
    expect(selector.value).toBe(account.id);
    expect(actionBar.contains(selector)).toBe(true);
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

  it('renders exactly one Receive button and one Send button on screen', () => {
    fixture.detectChanges();
    const receiveButtons = fixture.nativeElement.querySelectorAll('[data-testid="wallet-receive-button"]');
    const sendButtons = fixture.nativeElement.querySelectorAll('[data-testid="wallet-send-button"]');

    expect(receiveButtons.length).toBe(1);
    expect(sendButtons.length).toBe(1);
  });

  it('loads and aggregates recent transactions across accounts', async () => {
    historyRowsFor[account.id] = [
      {
        hash: 'hash1',
        subtype: 'send',
        amount: '1000000000000000000000000',
        account: 'nano_recipient',
        local_timestamp: '1600000000',
      },
    ];

    await component.loadTransactions();

    expect(component.transactions.length).toBe(1);
    expect(component.transactions[0].hash).toBe('hash1');
    expect(component.transactions[0].direction).toBe('sent');
    expect(component.transactions[0].accountLabel).toBe('Primary');
  });

  it('refreshes history after wallet reconciliation completes without an account change', async () => {
    const history = component['history'] as any;
    const initialCalls = history.rowsForAccounts.mock.calls.length;

    walletState$.next({ ...createState(), sync: { status: 'loading', reason: 'websocket-confirmation' } });
    walletState$.next({ ...createState(), sync: { status: 'ready', reason: 'websocket-confirmation' } });
    await fixture.whenStable();

    expect(history.rowsForAccounts).toHaveBeenCalledTimes(initialCalls + 1);
  });

  it('shows cached activity while the fresh node history request is still pending', async () => {
    let resolveFresh!: (rows: Map<string, any[]>) => void;
    const history = component['history'] as any;
    history.cachedRowsForAccounts = vi.fn(async () => new Map([[account.id, [{
      hash: 'cached-hash',
      subtype: 'receive',
      amount: '1000000',
    }]]]));
    history.rowsForAccounts = vi.fn(() => new Promise<Map<string, any[]>>(resolve => {
      resolveFresh = resolve;
    }));

    const loading = component.loadTransactions();
    await Promise.resolve();
    await Promise.resolve();

    expect(component.transactions.map(transaction => transaction.hash)).toEqual(['cached-hash']);
    expect(component.activityLoading).toBe(false);

    resolveFresh(new Map([[account.id, [{
      hash: 'fresh-hash',
      subtype: 'receive',
      amount: '2000000',
    }]]]));
    await loading;
    expect(component.transactions.map(transaction => transaction.hash)).toEqual(['fresh-hash']);
  });

  it('does not show a configured wallet as zero while startup reconciliation is loading', () => {
    walletState$.next({ ...createState(), balance: new BigNumber(0), sync: { status: 'loading', reason: 'startup' } });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.balance-display').textContent).toContain('Loading…');
    expect(fixture.nativeElement.querySelector('.balance-unit')).toBeFalsy();
  });

  it('caps the merged wallet list at 25 entries', async () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      hash: `h${i}`,
      subtype: 'receive',
      amount: '1000000',
      account: 'nano_other',
      local_timestamp: String(1600000000 + i),
    }));
    historyRowsFor[account.id] = many;

    await component.loadTransactions();

    expect(component.transactions.length).toBe(25);
  });

  it('reports an empty state rather than loading forever when there are no accounts', async () => {
    walletState$.next({ ...createState(), accounts: [], selectedAccountId: null, selectedAccount: null });

    await component.loadTransactions();

    expect(component.transactions).toEqual([]);
    expect(component.activityLoading).toBe(false);
  });
});