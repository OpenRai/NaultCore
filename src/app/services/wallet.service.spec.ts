import { BehaviorSubject } from 'rxjs';
import BigNumber from 'bignumber.js';

import { WalletService } from './wallet.service';

function createServiceForStateTests(): any {
  const service: any = Object.create(WalletService.prototype);
  service.lifecycleState = { kind: 'empty' };
  service.walletStateRevision = 0;
  service.authoritativeAccountKey = null;
  service.wallet = {
    balance: new BigNumber(0),
    pending: new BigNumber(0),
    balanceRaw: new BigNumber(0),
    pendingRaw: new BigNumber(0),
    balanceFiat: 0,
    pendingFiat: 0,
    hasPending: false,
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
    expect(after.accounts[0].balance.eq(10)).toBe(true);
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

describe('WalletService passkey lifecycle', () => {
  it('retains password protection and encrypted export without keeping the password in a passkey session', () => {
    const service = createServiceForStateTests();
    service.lifecycleState = {
      kind: 'unlocked', type: 'seed', secret: 'a'.repeat(64), secretBytes: new Uint8Array(32),
      password: '', encryptedSecret: 'original-password-encrypted-secret',
    };

    expect(service.hasPassword()).toBe(false);
    expect(service.hasPasswordProtectedWallet()).toBe(true);
    expect(service.generateExportData().seed).toBe('original-password-encrypted-secret');
  });

  function createPasskeyService(withPasskey = true) {
    const service: any = Object.create(WalletService.prototype);
    const state = { kind: 'unlocked', type: 'seed', secret: 'a'.repeat(64), secretBytes: new Uint8Array(32), password: 'wallet password', encryptedSecret: 'encrypted' };
    const previousRecord = { walletId: 'wallet-id', rpId: 'localhost', credentials: [{ credentialId: 'old', version: 1 }] };
    service.lifecycleState = state;
    service.lifecycleGeneration = 4;
    service.localWalletId = 'wallet-id';
    service.passkeyUnlockRecord = withPasskey ? previousRecord : null;
    service.appSettings = { settings: { walletStore: 'localStorage' } };
    service.passkeys = {
      isAvailable: () => true,
      newWalletId: () => 'new-wallet-id',
      enroll: vi.fn(),
      remove: vi.fn(),
    };
    service.generateWalletExport = vi.fn(() => ({}));
    service.persistWalletExport = vi.fn();
    return { service, previousRecord };
  }

  it('enrolls only one credential when this wallet has none', async () => {
    const { service } = createPasskeyService(false);
    service.passkeys.enroll.mockResolvedValue({
      ok: true,
      value: { walletId: 'wallet-id', rpId: 'localhost', credentials: [{ credentialId: 'new', version: 1 }, { credentialId: 'unexpected-extra', version: 1 }] },
    });

    expect(await service.enablePasskeyUnlock()).toBe(true);
    expect(service.passkeys.enroll).toHaveBeenCalledWith('wallet-id', 'seed', 'a'.repeat(64));
    expect(service.passkeyUnlockRecord.credentials.map((item: any) => item.credentialId)).toEqual(['unexpected-extra']);
    expect(service.persistWalletExport).toHaveBeenCalledOnce();
  });

  it('does not offer a second enrollment while one is configured', async () => {
    const { service, previousRecord } = createPasskeyService();

    expect(await service.enablePasskeyUnlock()).toBe(false);
    expect(service.passkeyUnlockRecord).toBe(previousRecord);
    expect(service.passkeys.enroll).not.toHaveBeenCalled();
  });

  it('removes the wallet enrollment without deleting the provider credential', async () => {
    const { service, previousRecord } = createPasskeyService();
    service.passkeys.remove.mockResolvedValue(null);

    expect(await service.removePasskeyUnlock('old')).toBe(true);
    expect(service.passkeyUnlockRecord).toBeNull();
    expect(service.passkeys.remove).toHaveBeenCalledWith(previousRecord, 'old');
    expect(service.persistWalletExport).toHaveBeenCalledOnce();
  });

  it('restores the enrollment if removal cannot be persisted', async () => {
    const { service, previousRecord } = createPasskeyService();
    service.passkeys.remove.mockResolvedValue(null);
    service.persistWalletExport.mockImplementation(() => { throw new Error('storage unavailable'); });

    expect(await service.removePasskeyUnlock('old')).toBe(false);
    expect(service.passkeyUnlockRecord).toBe(previousRecord);
  });
});

describe('WalletService wallet-owned mutations', () => {
  it('publishes account ordering and selection through snapshots', () => {
    const service = createServiceForStateTests();
    service.wallet.accounts = [
      { id: 'nano_2', index: 2, balance: new BigNumber(0), pending: new BigNumber(0), balanceRaw: new BigNumber(0), pendingRaw: new BigNumber(0), balanceFiat: 0, pendingFiat: 0, addressBookName: null, receivePow: false },
      { id: 'nano_1', index: 1, balance: new BigNumber(0), pending: new BigNumber(0), balanceRaw: new BigNumber(0), pendingRaw: new BigNumber(0), balanceFiat: 0, pendingFiat: 0, addressBookName: null, receivePow: false },
    ];
    const initialRevision = service.walletStateSubject.value.revision;

    service.sortAccountsByIndex();
    expect(service.wallet.accounts.map(account => account.id)).toEqual(['nano_1', 'nano_2']);
    expect(service.walletStateSubject.value.revision).toBe(initialRevision + 1);

    const selected = service.selectAccount('nano_2');
    expect(selected?.id).toBe('nano_2');
    expect(service.walletStateSubject.value.selectedAccountId).toBe('nano_2');
    expect(service.walletStateSubject.value.revision).toBe(initialRevision + 2);
  });

  it('rejects an invalid selected account without changing the aggregate context', () => {
    const service = createServiceForStateTests();
    service.wallet.accounts = [
      { id: 'nano_1', index: 0, balance: new BigNumber(0), pending: new BigNumber(0), balanceRaw: new BigNumber(0), pendingRaw: new BigNumber(0), balanceFiat: 0, pendingFiat: 0, addressBookName: null, receivePow: false },
    ];

    service.selectAccount('nano_missing');

    expect(service.walletState.selectedAccountId).toBeNull();
    expect(service.walletState.selectedAccount).toBeNull();
  });

  it('restores only a persisted account that is still present in the wallet', () => {
    const service = createServiceForStateTests();
    service.wallet.accounts = [
      { id: 'nano_2', index: 2, balance: new BigNumber(0), pending: new BigNumber(0), balanceRaw: new BigNumber(0), pendingRaw: new BigNumber(0), balanceFiat: 0, pendingFiat: 0, addressBookName: null, receivePow: false },
    ];

    const restored = service.restoreSelectedAccount('nano_2');
    expect(restored?.id).toBe('nano_2');
    expect(service.walletState.selectedAccountId).toBe('nano_2');

    service.restoreSelectedAccount('nano_missing');
    expect(service.walletState.selectedAccountId).toBeNull();
  });

  it('falls back to the lowest-index account when the selected account is removed', async () => {
    const service = createServiceForStateTests();
    service.wallet.accounts = [
      { id: 'nano_2', index: 2, balance: new BigNumber(0), pending: new BigNumber(0), balanceRaw: new BigNumber(0), pendingRaw: new BigNumber(0), balanceFiat: 0, pendingFiat: 0, addressBookName: null, receivePow: false },
      { id: 'nano_1', index: 1, balance: new BigNumber(0), pending: new BigNumber(0), balanceRaw: new BigNumber(0), pendingRaw: new BigNumber(0), balanceFiat: 0, pendingFiat: 0, addressBookName: null, receivePow: false },
    ];
    service.wallet.selectedAccountId = 'nano_2';
    service.wallet.selectedAccount = service.wallet.accounts[0];
    service.websocket = { unsubscribeAccounts: vi.fn() };
    service.refreshWalletState = vi.fn().mockResolvedValue(service.walletState);
    service.saveWalletExport = vi.fn();

    await service.removeWalletAccount('nano_2');

    expect(service.walletState.selectedAccountId).toBe('nano_1');
    expect(service.walletState.selectedAccount?.id).toBe('nano_1');
  });
});

describe('WalletService reconciliation coordination', () => {
  it('marks the first authoritative snapshot and retains it during later refreshes', async () => {
    const startupService = createServiceForStateTests();
    expect(startupService.walletState.sync.hasSnapshot).toBe(false);
    startupService.reloadBalancesFromNode = async () => undefined;
    await startupService.refreshWalletState('startup');
    expect(startupService.walletState.sync.hasSnapshot).toBe(true);

    // Hold a later background refresh open after startup has completed.
    const service = createServiceForStateTests();
    service.authoritativeAccountKey = '';
    let releaseRefresh!: () => void;
    service.reloadBalancesFromNode = async () => new Promise<void>(resolve => releaseRefresh = resolve);

    const refresh = service.refreshWalletState('background');
    await Promise.resolve();
    expect(service.walletState.sync.status).toBe('loading');
    expect(service.walletState.sync.hasSnapshot).toBe(true);
    releaseRefresh();
    await refresh;
    expect(service.walletState.sync.status).toBe('ready');
  });

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

    let error: unknown;
    try {
      await service.refreshWalletState('manual');
    } catch (caught) {
      error = caught;
    }
    expect(error instanceof Error ? error.message : error).toBe('node unavailable');

    expect(service.walletStateSubject.value.sync.status).toBe('error');
    expect(service.walletStateSubject.value.sync.reason).toBe('manual');

    const retrySnapshot = await service.refreshWalletState('retry');
    expect(attempts).toBe(2);
    expect(retrySnapshot.sync.status).toBe('ready');
  });
});

describe('WalletService WebSocket confirmation guard', () => {
  it('requires an existing confirmed state block before projection', async () => {
    const service = createServiceForStateTests();
    const hash = 'A'.repeat(64);
    service.api = {
      blocksInfo: vi.fn().mockResolvedValue({
        blocks: {
          [hash]: { confirmed: 'true', subtype: 'receive' },
        },
      }),
    };

    expect(await service.verifyConfirmedTransaction({
      hash,
      block: { type: 'state', subtype: 'receive', account: 'nano_1test' },
    })).toBe(true);
    expect(service.api.blocksInfo).toHaveBeenCalledWith([hash]);
  });

  it('rejects unknown, provisional, and non-state confirmations', async () => {
    const service = createServiceForStateTests();
    const hash = 'B'.repeat(64);
    service.api = {
      blocksInfo: vi.fn().mockResolvedValue({
        blocks: {
          [hash]: { confirmed: false },
        },
      }),
    };

    expect(await service.verifyConfirmedTransaction({
      hash,
      block: { type: 'state', account: 'nano_1test' },
    })).toBe(false);
    expect(await service.verifyConfirmedTransaction({
      hash: 'C'.repeat(64),
      block: { type: 'state', account: 'nano_1test' },
    })).toBe(false);
    expect(await service.verifyConfirmedTransaction({
      hash,
      block: { type: 'send', account: 'nano_1test' },
    })).toBe(false);
  });
});
