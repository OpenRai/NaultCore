import { BehaviorSubject } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import { WalletContextService } from './wallet-context.service';
import { WalletService } from './wallet.service';

function createWalletState(selectedAccountId: string | null, accounts: string[]) {
  const accountSnapshots = accounts.map((id, index) => ({ id, index }));
  return {
    selectedAccountId,
    selectedAccount: selectedAccountId
      ? accountSnapshots.find(account => account.id === selectedAccountId) || null
      : null,
    accounts: accountSnapshots,
  };
}

describe('WalletContextService', () => {
  let service: WalletContextService;
  let wallet: {
    walletState: ReturnType<typeof createWalletState>;
    walletState$: BehaviorSubject<ReturnType<typeof createWalletState>>;
    getWalletAccount: ReturnType<typeof vi.fn>;
    selectAccount: ReturnType<typeof vi.fn>;
    saveWalletExport: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    wallet = {
      walletState: createWalletState('nano_1', ['nano_1', 'nano_2']),
      walletState$: new BehaviorSubject(createWalletState('nano_1', ['nano_1', 'nano_2'])),
      getWalletAccount: vi.fn(id => wallet.walletState.accounts.find(account => account.id === id)),
      selectAccount: vi.fn((id: string | null) => {
        wallet.walletState = createWalletState(id, ['nano_1', 'nano_2']);
        wallet.walletState$.next(wallet.walletState);
      }),
      saveWalletExport: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        WalletContextService,
        { provide: WalletService, useValue: wallet },
      ],
    });
    service = TestBed.inject(WalletContextService);
  });

  it('projects the WalletService selection as account or aggregate context', () => {
    expect(service.selectedAccount).toEqual({ kind: 'account', accountId: 'nano_1' });

    wallet.walletState = createWalletState(null, ['nano_1', 'nano_2']);
    expect(service.selectedAccount).toEqual({ kind: 'aggregate', accountId: null });
  });

  it('does not let an invalid account query clear the selected account', () => {
    expect(service.selectAccount('nano_missing')).toEqual({ kind: 'account', accountId: 'nano_1' });
    expect(wallet.selectAccount).not.toHaveBeenCalled();
    expect(wallet.saveWalletExport).not.toHaveBeenCalled();
  });

  it('persists valid account and aggregate selections through the wallet authority', () => {
    expect(service.selectAccount('nano_2')).toEqual({ kind: 'account', accountId: 'nano_2' });
    expect(wallet.selectAccount).toHaveBeenCalledWith('nano_2');
    expect(wallet.saveWalletExport).toHaveBeenCalledTimes(1);

    expect(service.selectAccount(null)).toEqual({ kind: 'aggregate', accountId: null });
    expect(wallet.selectAccount).toHaveBeenCalledWith(null);
    expect(wallet.saveWalletExport).toHaveBeenCalledTimes(2);
  });

  it('resolves explicit query, selected, fallback, and empty transaction contexts deterministically', () => {
    expect(service.resolveTransactionContext('send', 'nano_2')).toEqual({
      intent: 'send', accountId: 'nano_2', source: 'query', explicit: true,
    });
    expect(service.resolveTransactionContext('receive')).toEqual({
      intent: 'receive', accountId: 'nano_1', source: 'selected', explicit: false,
    });

    wallet.walletState = createWalletState(null, ['nano_2']);
    expect(service.resolveTransactionContext('receive')).toEqual({
      intent: 'receive', accountId: 'nano_2', source: 'fallback', explicit: false,
    });

    wallet.walletState = createWalletState(null, []);
    expect(service.resolveTransactionContext('send', 'nano_missing')).toEqual({
      intent: 'send', accountId: null, source: 'none', explicit: false,
    });
  });

  it('keeps destination and transaction route contracts explicit', () => {
    expect(service.destination('wallet')).toEqual({ commands: ['/wallet'] });
    expect(service.destination('accounts')).toEqual({ commands: ['/accounts'] });
    expect(service.destination('qr-scan')).toEqual({ commands: ['/qr-scan'] });
    expect(service.transaction('receive', 'nano_2')).toEqual({
      commands: ['/receive'], queryParams: { account: 'nano_2' },
    });
    expect(service.transaction('send')).toEqual({ commands: ['/send'] });
  });

  it('does not emit a competing account state subject', () => {
    const contexts: unknown[] = [];
    const subscription = service.selectedAccount$.subscribe(context => contexts.push(context));

    expect(contexts).toEqual([{ kind: 'account', accountId: 'nano_1' }]);
    subscription.unsubscribe();
  });
});
