import { BehaviorSubject } from 'rxjs';
import BigNumber from 'bignumber.js';

import { WalletService } from './wallet.service';

function createServiceForStateTests(): any {
  const service: any = Object.create(WalletService.prototype);
  service.lifecycleState = { kind: 'empty' };
  service.walletStateRevision = 0;
  service.wallet = {
    balance: new BigNumber(0),
    pending: new BigNumber(0),
    balanceRaw: new BigNumber(0),
    pendingRaw: new BigNumber(0),
    balanceFiat: 0,
    pendingFiat: 0,
    balanceInitialized: false,
    hasPending: false,
    updatingBalance: false,
    accounts: [],
    selectedAccountId: null,
    selectedAccount: null,
    pendingBlocks: [],
  };
  service.walletStateSubject = new BehaviorSubject(
    service.createWalletStateSnapshot({ status: 'idle', reason: 'test' })
  );
  service.reconciliationRequestedGeneration = 0;
  service.reconciliationCompletedGeneration = 0;
  service.reconciliationPromise = null;
  service.reconciliationWaiters = [];
  service.informBalanceRefresh = () => undefined;
  service.processPendingBlocks = async () => undefined;
  return service;
}

describe('WalletService wallet state snapshots', () => {
  it('replays immutable account state without exposing credentials', () => {
    const service = createServiceForStateTests();
    const secret = new Uint8Array([1, 2, 3]);
    service.wallet.accounts = [{
      id: 'nano_1test',
      frontier: 'A'.repeat(64),
      secret,
      keyPair: { privateKey: secret },
      index: 0,
      balance: new BigNumber(10),
      pending: new BigNumber(2),
      balanceRaw: new BigNumber(10),
      pendingRaw: new BigNumber(2),
      balanceFiat: 1,
      pendingFiat: 0.2,
      addressBookName: 'Primary',
      receivePow: true,
    }];
    service.wallet.selectedAccountId = 'nano_1test';

    const before = service.walletStateSubject.value;
    const after = service.publishWalletState({ status: 'ready', reason: 'test' });

    expect(after.revision).toBe(before.revision + 1);
    expect(after.accounts[0].id).toBe('nano_1test');
    expect(after.accounts[0].balance.eq(10)).toBeTrue();
    expect((after.accounts[0] as any).secret).toBeUndefined();
    expect((after.accounts[0] as any).keyPair).toBeUndefined();
    expect(() => (after.accounts as any).push({})).toThrow();
  });

  it('replays the latest snapshot to late subscribers', () => {
    const service = createServiceForStateTests();
    const snapshot = service.publishWalletState({ status: 'ready', reason: 'test' });
    let received;

    service.walletStateSubject.subscribe(value => received = value);

    expect(received).toBe(snapshot);
  });
});

describe('WalletService reconciliation coordination', () => {
  it('runs a follow-up generation for invalidation during a query', async () => {
    const service = createServiceForStateTests();
    let releaseFirst;
    let refreshRuns = 0;
    let activeRuns = 0;
    let maxActiveRuns = 0;
    service.reloadBalancesFromNode = async () => {
      refreshRuns++;
      activeRuns++;
      maxActiveRuns = Math.max(maxActiveRuns, activeRuns);
      if (refreshRuns === 1) await new Promise(resolve => releaseFirst = resolve);
      activeRuns--;
    };

    const first = service.refreshWalletState('startup');
    await Promise.resolve();
    const second = service.refreshWalletState('websocket');
    releaseFirst();

    const [firstSnapshot, secondSnapshot] = await Promise.all([first, second]);

    expect(refreshRuns).toBe(2);
    expect(maxActiveRuns).toBe(1);
    expect(firstSnapshot.sync.status).toBe('ready');
    expect(secondSnapshot.sync.status).toBe('ready');
    expect(secondSnapshot.revision).toBeGreaterThan(firstSnapshot.revision);
  });

  it('publishes an error snapshot and leaves the wallet retryable', async () => {
    const service = createServiceForStateTests();
    let attempts = 0;
    service.reloadBalancesFromNode = async () => {
      attempts++;
      if (attempts === 1) throw new Error('node unavailable');
    };

    await expectAsync(service.refreshWalletState('manual')).toBeRejectedWithError('node unavailable');

    expect(service.wallet.updatingBalance).toBeFalse();
    expect(service.walletStateSubject.value.sync.status).toBe('error');
    expect(service.walletStateSubject.value.sync.reason).toBe('manual');

    const retrySnapshot = await service.refreshWalletState('retry');
    expect(attempts).toBe(2);
    expect(retrySnapshot.sync.status).toBe('ready');
  });
});
