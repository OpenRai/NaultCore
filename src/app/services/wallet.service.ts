import { Injectable, Injector, inject } from '@angular/core';
import {BehaviorSubject} from 'rxjs';
import {UtilService} from './util.service';
import {ApiService} from './api.service';
import {BigNumber} from 'bignumber.js';
import {AddressBookService} from './address-book.service';
import * as CryptoJS from 'crypto-js';
import {WorkPoolService} from './work-pool.service';
import {WebsocketService} from './websocket.service';
import {NanoBlockService} from './nano-block.service';
import {NotificationService} from './notification.service';
import {AppSettingsService} from './app-settings.service';
import {PriceService} from './price.service';
import {LedgerService} from './ledger.service';
import { NoPaddingZerosPipe } from 'app/pipes/no-padding-zeros.pipe';
import { NanoNymManagerService } from './nanonym-manager.service';
import { NanoNymStorageService } from './nanonym-storage.service';
import { SpendableAccount, RegularAccount, NanoNymAccount } from '../types/spendable-account.types';
import { combineLatest, Observable, of } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';
import { environment } from 'environments/environment';

export type WalletType = 'seed' | 'ledger' | 'privateKey' | 'expandedKey';
type SoftwareWalletType = Exclude<WalletType, 'ledger'>;

/** Secret-bearing state is deliberately private to WalletService. */
type WalletLifecycleState =
  | { kind: 'empty' }
  | { kind: 'locked'; type: SoftwareWalletType; encryptedSecret: string }
  | { kind: 'unlocked'; type: SoftwareWalletType; secret: string; secretBytes: Uint8Array; password: string }
  | { kind: 'ledger' };

export interface WalletLifecycleSnapshot {
  kind: WalletLifecycleState['kind'];
  type: WalletType|null;
  locked: boolean;
  configured: boolean;
}

export type WalletSyncStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface WalletSyncState {
  status: WalletSyncStatus;
  reason?: string;
  error?: string;
}

export interface WalletAccountSnapshot {
  id: string;
  frontier: string|null;
  index: number;
  balance: BigNumber;
  pending: BigNumber;
  balanceRaw: BigNumber;
  pendingRaw: BigNumber;
  balanceFiat: number;
  pendingFiat: number;
  addressBookName: string|null;
  receivePow: boolean;
  isStealthAccount?: boolean;
  publicKeyHex?: string;
  nonStandardIndex?: boolean;
}

export interface WalletStateSnapshot {
  revision: number;
  lifecycle: WalletLifecycleSnapshot;
  accounts: ReadonlyArray<WalletAccountSnapshot>;
  selectedAccountId: string|null;
  selectedAccount: WalletAccountSnapshot|null;
  balance: BigNumber;
  pending: BigNumber;
  balanceRaw: BigNumber;
  pendingRaw: BigNumber;
  balanceFiat: number;
  pendingFiat: number;
  hasPending: boolean;
  pendingBlocks: ReadonlyArray<Readonly<Block>>;
  sync: WalletSyncState;
}

export interface WalletAccount {
  id: string;
  frontier: string|null;
  secret: any;
  keyPair: any;
  index: number;
  balance: BigNumber;
  pending: BigNumber;
  balanceRaw: BigNumber;
  pendingRaw: BigNumber;
  balanceFiat: number;
  pendingFiat: number;
  addressBookName: string|null;
  receivePow: boolean;
  isStealthAccount?: boolean;  // Flag for stealth account scalar-based signing
  publicKeyHex?: string;  // Public key hex for stealth account signature verification
  nonStandardIndex?: boolean;  // Flag for accounts derived with out-of-range index (non-standard 4+ byte derivation)
}

export interface Block {
  account: string;
  hash: string;
  amount: string;
  source: string;
}

export interface ReceivableBlockUpdate {
  account: string;
  sourceHash: string;
  destinationHash: string|null;
  hasBeenReceived: boolean;
}

export interface FullWallet {
  balance: BigNumber;
  pending: BigNumber;
  balanceRaw: BigNumber;
  pendingRaw: BigNumber;
  balanceFiat: number;
  pendingFiat: number;
  hasPending: boolean;
  updatingBalance: boolean;
  balanceInitialized: boolean;
  accounts: WalletAccount[];
  selectedAccountId: string|null;
  selectedAccount: WalletAccount|null;
  selectedAccount$: BehaviorSubject<WalletAccount|null>;
  unlockModalRequested$: BehaviorSubject<boolean|false>;
  pendingBlocks: Block[];
  pendingBlocksUpdate$: BehaviorSubject<ReceivableBlockUpdate|null>;
  newWallet$: BehaviorSubject<boolean|false>;
  refresh$: BehaviorSubject<boolean|false>;
}

export interface BaseApiAccount {
  account_version: string;
  balance: string;
  block_count: string;
  frontier: string;
  modified_timestamp: string;
  open_block: string;
  pending: string;
  representative: string;
  representative_block: string;
  weight: string;
}

export interface WalletApiAccount extends BaseApiAccount {
  addressBookName?: string|null;
  id?: string;
}

interface ReconciliationWaiter {
  generation: number;
  resolve: (snapshot: WalletStateSnapshot) => void;
  reject: (error: unknown) => void;
}

@Injectable()
export class WalletService {
  private util = inject(UtilService);
  private api = inject(ApiService);
  private appSettings = inject(AppSettingsService);
  private addressBook = inject(AddressBookService);
  private price = inject(PriceService);
  private workPool = inject(WorkPoolService);
  private websocket = inject(WebsocketService);
  private nanoBlock = inject(NanoBlockService);
  private ledgerService = inject(LedgerService);
  private noZerosPipe = inject(NoPaddingZerosPipe);
  private notifications = inject(NotificationService);
  private nanoNymStorage = inject(NanoNymStorageService);
  private injector = inject(Injector);

  nano = 1000000000000000000000000;
  storeKey = `nanovault-wallet`;

  private lifecycleState: WalletLifecycleState = { kind: 'empty' };
  private readonly lifecycleSubject = new BehaviorSubject<WalletLifecycleSnapshot>(this.lifecycleSnapshot());
  readonly lifecycle$: Observable<WalletLifecycleSnapshot> = this.lifecycleSubject.asObservable();

  wallet: FullWallet = {
    balance: new BigNumber(0),
    pending: new BigNumber(0),
    balanceRaw: new BigNumber(0),
    pendingRaw: new BigNumber(0),
    balanceFiat: 0,
    pendingFiat: 0,
    hasPending: false,
    updatingBalance: false,
    balanceInitialized: false,
    accounts: [],
    selectedAccountId: null,
    selectedAccount: null,
    selectedAccount$: new BehaviorSubject(null),
    unlockModalRequested$: new BehaviorSubject(false),
    pendingBlocks: [],
    pendingBlocksUpdate$: new BehaviorSubject(null),
    newWallet$: new BehaviorSubject(false),
    refresh$: new BehaviorSubject(false),
  };

  private walletStateRevision = 0;
  private readonly walletStateSubject: BehaviorSubject<WalletStateSnapshot>;
  readonly walletState$: Observable<WalletStateSnapshot>;
  private reconciliationRequestedGeneration = 0;
  private reconciliationCompletedGeneration = 0;
  private reconciliationPromise: Promise<void>|null = null;
  private reconciliationReason = 'initialization';
  private reconciliationWaiters: ReconciliationWaiter[] = [];

  processingPending = false;
  successfulBlocks = [];
  trackedHashes = [];

  get lifecycle(): WalletLifecycleSnapshot {
    return this.lifecycleSnapshot();
  }

  private lifecycleSnapshot(state = this.lifecycleState): WalletLifecycleSnapshot {
    const type = state.kind === 'empty' ? null : state.kind === 'ledger' ? 'ledger' : state.type;
    return { kind: state.kind, type, locked: state.kind === 'locked', configured: state.kind !== 'empty' };
  }

  private commitLifecycle(state: WalletLifecycleState, publish = true): void {
    this.lifecycleState = state;
    this.lifecycleSubject.next(this.lifecycleSnapshot(state));
    if (publish) this.publishWalletState();
  }

  private unlockedState(): Extract<WalletLifecycleState, { kind: 'unlocked' }> | null {
    return this.lifecycleState.kind === 'unlocked' ? this.lifecycleState : null;
  }

  private softwareType(): SoftwareWalletType | null {
    return this.lifecycleState.kind === 'locked' || this.lifecycleState.kind === 'unlocked'
      ? this.lifecycleState.type : null;
  }

  private clearBytes(bytes: Uint8Array|null|undefined): void {
    if (bytes) bytes.fill(0);
  }

  get walletState(): WalletStateSnapshot {
    return this.walletStateSubject.value;
  }

  /** Replayed selected-account projection, emitting only when selection changes. */
  get selectedAccountState$(): Observable<WalletAccountSnapshot|null> {
    return this.walletState$.pipe(
      map(snapshot => snapshot.selectedAccount),
      distinctUntilChanged((previous, current) => previous?.id === current?.id),
    );
  }

  /** Read-only transient unlock-modal request stream for UI coordination. */
  get unlockModalRequested$(): Observable<boolean> {
    return this.wallet.unlockModalRequested$.asObservable();
  }

  cancelWalletUnlockRequest(): void {
    this.wallet.unlockModalRequested$.next(false);
  }

  private createWalletStateSnapshot(sync: WalletSyncState): WalletStateSnapshot {
    const accounts = this.wallet.accounts.map(account => Object.freeze({
      id: account.id,
      frontier: account.frontier,
      index: account.index,
      balance: new BigNumber(account.balance || 0),
      pending: new BigNumber(account.pending || 0),
      balanceRaw: new BigNumber(account.balanceRaw || 0),
      pendingRaw: new BigNumber(account.pendingRaw || 0),
      balanceFiat: account.balanceFiat,
      pendingFiat: account.pendingFiat,
      addressBookName: account.addressBookName,
      receivePow: account.receivePow,
      ...(account.isStealthAccount === undefined ? {} : { isStealthAccount: account.isStealthAccount }),
      ...(account.publicKeyHex === undefined ? {} : { publicKeyHex: account.publicKeyHex }),
      ...(account.nonStandardIndex === undefined ? {} : { nonStandardIndex: account.nonStandardIndex }),
    }));
    const selectedAccountId = this.wallet.selectedAccountId || this.wallet.selectedAccount?.id || null;
    const selectedAccount = accounts.find(account => account.id === selectedAccountId) || null;
    const pendingBlocks = this.wallet.pendingBlocks.map(block => Object.freeze({ ...block }));

    return Object.freeze({
      revision: this.walletStateRevision,
      lifecycle: Object.freeze(this.lifecycleSnapshot()),
      accounts: Object.freeze(accounts),
      selectedAccountId,
      selectedAccount,
      balance: new BigNumber(this.wallet.balance || 0),
      pending: new BigNumber(this.wallet.pending || 0),
      balanceRaw: new BigNumber(this.wallet.balanceRaw || 0),
      pendingRaw: new BigNumber(this.wallet.pendingRaw || 0),
      balanceFiat: this.wallet.balanceFiat,
      pendingFiat: this.wallet.pendingFiat,
      hasPending: this.wallet.hasPending,
      pendingBlocks: Object.freeze(pendingBlocks),
      sync: Object.freeze({ ...sync }),
    });
  }

  private publishWalletState(sync = this.walletStateSubject.value.sync): WalletStateSnapshot {
    this.walletStateRevision += 1;
    const snapshot = this.createWalletStateSnapshot(sync);
    this.walletStateSubject.next(snapshot);
    return snapshot;
  }

  async refreshWalletState(reason = 'manual'): Promise<WalletStateSnapshot> {
    const generation = ++this.reconciliationRequestedGeneration;
    this.reconciliationReason = reason;
    const result = new Promise<WalletStateSnapshot>((resolve, reject) => {
      this.reconciliationWaiters.push({ generation, resolve, reject });
    });

    if (!this.reconciliationPromise) {
      this.reconciliationPromise = this.runReconciliation().finally(() => {
        this.reconciliationPromise = null;
      });
    }

    return result;
  }

  private async runReconciliation(): Promise<void> {
    while (this.reconciliationCompletedGeneration < this.reconciliationRequestedGeneration) {
      const generation = this.reconciliationRequestedGeneration;
      const reason = this.reconciliationReason;
      this.publishWalletState({ status: 'loading', reason });

      try {
        await this.reloadBalancesFromNode();
        this.reconciliationCompletedGeneration = generation;
        const snapshot = this.publishWalletState({ status: 'ready', reason });
        this.resolveReconciliationWaiters(generation, snapshot);
        // Keep the legacy pulse as a temporary adapter for unmigrated callers.
        this.informBalanceRefresh();
        // Pending processing must not hold the reconciliation coordinator open.
        void this.processPendingBlocks();
      } catch (error) {
        this.wallet.updatingBalance = false;
        this.reconciliationCompletedGeneration = generation;
        this.publishWalletState({
          status: 'error',
          reason,
          error: error instanceof Error ? error.message : 'Wallet state refresh failed',
        });
        this.rejectReconciliationWaiters(generation, error);
      }
    }
  }

  private resolveReconciliationWaiters(generation: number, snapshot: WalletStateSnapshot): void {
    const remaining: ReconciliationWaiter[] = [];
    this.reconciliationWaiters.forEach(waiter => {
      if (waiter.generation <= generation) waiter.resolve(snapshot);
      else remaining.push(waiter);
    });
    this.reconciliationWaiters = remaining;
  }

  private rejectReconciliationWaiters(generation: number, error: unknown): void {
    const remaining: ReconciliationWaiter[] = [];
    this.reconciliationWaiters.forEach(waiter => {
      if (waiter.generation <= generation) waiter.reject(error);
      else remaining.push(waiter);
    });
    this.reconciliationWaiters = remaining;
  }

  constructor() {
    this.walletStateSubject = new BehaviorSubject(this.createWalletStateSnapshot({ status: 'idle', reason: 'initialization' }));
    this.walletState$ = this.walletStateSubject.asObservable();

    this.websocket.newTransactions$.subscribe(async (transaction) => {
      if (!transaction) return; // Not really a new transaction
      console.log('New Transaction', transaction);
      let shouldNotify = false;
      if (this.appSettings.settings.minimumReceive) {
        const minAmount = this.util.nano.mnanoToRaw(this.appSettings.settings.minimumReceive);
        if ((new BigNumber(transaction.amount)).gte(minAmount)) {
          shouldNotify = true;
        }
      } else {
        shouldNotify = true;
      }

      const walletAccountIDs = this.wallet.accounts.map(a => a.id);

      // Include stealth account addresses in transaction detection
      let allAccountIDs = walletAccountIDs;
      let stealthAccountIDs: string[] = [];
      if (FEATURE_NANONYMS && this.nanoNymStorage) {
        stealthAccountIDs = this.nanoNymStorage.getAllNanoNyms()
          .reduce((acc, nn) => acc.concat(nn.stealthAccounts.map(sa => sa.address)), [] as string[]);
        allAccountIDs = [...walletAccountIDs, ...stealthAccountIDs];
      }

      const isConfirmedIncomingTransactionForOwnWalletAccount = (
          (transaction.block.type === 'state')
        && (transaction.block.subtype === 'send')
        && ( allAccountIDs.includes(transaction.block.link_as_account) === true )
      );

      const isConfirmedSendTransactionFromOwnWalletAccount = (
          (transaction.block.type === 'state')
        && (transaction.block.subtype === 'send')
        && ( allAccountIDs.includes(transaction.block.account) === true )
      );

      const isConfirmedReceiveTransactionFromOwnWalletAccount = (
          (transaction.block.type === 'state')
        && (transaction.block.subtype === 'receive')
        && ( allAccountIDs.includes(transaction.block.account) === true )
      );

      if (isConfirmedIncomingTransactionForOwnWalletAccount === true) {
        if (shouldNotify === true) {
          if (this.isLocked() && this.appSettings.settings.pendingOption !== 'manual') {
            this.notifications.sendWarning(`New incoming transaction - Unlock the wallet to receive`, { length: 10000, identifier: 'pending-locked' });
          } else if (this.appSettings.settings.pendingOption === 'manual') {
            this.notifications.sendWarning(`New incoming transaction - Set to be received manually`, { length: 10000, identifier: 'pending-locked' });
          }
        } else {
          console.log(
            `Found new incoming block that was below minimum receive amount: `,
            transaction.amount,
            this.appSettings.settings.minimumReceive
          );
        }
        await this.processStateBlock(transaction);
      } else if (isConfirmedSendTransactionFromOwnWalletAccount === true) {
        shouldNotify = true;
        await this.processStateBlock(transaction);

        // If this is a stealth account transaction, refresh its balance
        if (FEATURE_NANONYMS && stealthAccountIDs.includes(transaction.block.account)) {
          const nanoNyms = this.nanoNymStorage.getAllNanoNyms();
          for (const nn of nanoNyms) {
            const stealthAccount = nn.stealthAccounts.find(sa => sa.address === transaction.block.account);
            if (stealthAccount) {
              const nanonymManager = this.injector.get(NanoNymManagerService);
              await nanonymManager.refreshBalances(nn.index);
              break;
            }
          }
        }
      } else if (isConfirmedReceiveTransactionFromOwnWalletAccount === true) {
        shouldNotify = true;
      }

      // Find if the source or destination is a tracked address in the address book
      // This is a send transaction (to tracked account or from tracked account)
      if (walletAccountIDs.indexOf(transaction.block.link_as_account) === -1 && transaction.block.type === 'state' &&
      (transaction.block.subtype === 'send' || transaction.block.subtype === 'receive') || transaction.block.subtype === 'change' &&
      (this.addressBook.getTransactionTrackingById(transaction.block.link_as_account) ||
      this.addressBook.getTransactionTrackingById(transaction.block.account))) {
        if (shouldNotify || transaction.block.subtype === 'change') {
          const trackedAmount = this.util.nano.rawToMnano(transaction.amount);
          // Save hash so we can ignore duplicate messages if subscribing to both send and receive
          if (this.trackedHashes.indexOf(transaction.hash) !== -1) return; // Already notified this block
          this.trackedHashes.push(transaction.hash);
          const addressLink = transaction.block.link_as_account;
          const address = transaction.block.account;
          const rep = transaction.block.representative;
          const accountHrefLink = `<a href="/account/${addressLink}">${this.addressBook.getAccountName(addressLink)}</a>`;
          const accountHref = `<a href="/account/${address}">${this.addressBook.getAccountName(address)}</a>`;

          if (transaction.block.subtype === 'send') {
            // Incoming transaction
            if (this.addressBook.getTransactionTrackingById(addressLink)) {
              this.notifications.sendInfo(`Tracked address ${accountHrefLink} can now receive ${trackedAmount} XNO`, { length: 10000 });
              console.log(`Tracked incoming block to: ${address} - Ӿ${trackedAmount}`);
            }
            // Outgoing transaction
            if (this.addressBook.getTransactionTrackingById(address)) {
              this.notifications.sendInfo(`Tracked address ${accountHref} sent ${trackedAmount} XNO`, { length: 10000 });
              console.log(`Tracked send block from: ${address} - Ӿ${trackedAmount}`);
            }
          } else if (transaction.block.subtype === 'receive' && this.addressBook.getTransactionTrackingById(address)) {
            // Receive transaction
            this.notifications.sendInfo(`Tracked address ${accountHref} received incoming ${trackedAmount} XNO`, { length: 10000 });
            console.log(`Tracked receive block to: ${address} - Ӿ${trackedAmount}`);
          } else if (transaction.block.subtype === 'change' && this.addressBook.getTransactionTrackingById(address)) {
            // Change transaction
            this.notifications.sendInfo(`Tracked address ${accountHref} changed its representative to ${rep}`, { length: 10000 });
            console.log(`Tracked change block of: ${address} - Rep: ${rep}`);
          }
        } else {
          console.log(
            `Found new transaction on watch-only account that was below minimum receive amount: `,
            transaction.amount,
            this.appSettings.settings.minimumReceive
          );
        }
      }

      // TODO: We don't really need to call to update balances, we should be able to balance on our own from here
      // I'm not sure about that because what happens if the websocket is disconnected and misses a transaction?
      // won't the balance be incorrect if relying only on the websocket? / Json

      const shouldReloadBalances = (
          (shouldNotify === true)
        && (
            (isConfirmedIncomingTransactionForOwnWalletAccount === true)
          || (isConfirmedSendTransactionFromOwnWalletAccount === true)
          || (isConfirmedReceiveTransactionFromOwnWalletAccount === true)
        )
      );

      if (shouldReloadBalances === true) {
        await this.reloadBalances();
      }
    });

    this.addressBook.addressBook$.subscribe(newAddressBook => {
      this.reloadAddressBook();
    });
  }

  async processStateBlock(transaction) {
    // If we have a minimum receive,  once we know the account... add the amount to wallet pending? set pending to true
    if (transaction.block.subtype === 'send' && transaction.block.link_as_account) {
      // This is an incoming send block, we want to perform a receive
      const walletAccount = this.wallet.accounts.find(a => a.id === transaction.block.link_as_account);
      if (!walletAccount) return; // Not for our wallet?

      const txAmount = new BigNumber(transaction.amount);
      let aboveMinimumReceive = true;

      if (this.appSettings.settings.minimumReceive) {
        const minAmount = this.util.nano.mnanoToRaw(this.appSettings.settings.minimumReceive);
        aboveMinimumReceive = txAmount.gte(minAmount);
      }

      if (aboveMinimumReceive === true) {
        const isNewBlock = this.addPendingBlock(walletAccount.id, transaction.hash, txAmount, transaction.account);

        if (isNewBlock === true) {
          const root = walletAccount.frontier || this.util.account.getAccountPublicKey(walletAccount.id);
          this.workPool.noteReceiveExpected(walletAccount.id, root);
        }
      }

      await this.processPendingBlocks();
    } else {
      // Not a send to us, which means it was a block posted by us.  We shouldnt need to do anything...
      const walletAccount = this.wallet.accounts.find(a => a.id === transaction.block.link_as_account);
      if (!walletAccount) return; // Not for our wallet?
    }
  }

  reloadAddressBook() {
    this.wallet.accounts.forEach(account => {
      account.addressBookName = this.addressBook.getAccountName(account.id);
    });
    this.publishWalletState();
  }

  /** Select a regular wallet account and publish the coherent snapshot. */
  selectAccount(accountID: string|null): WalletAccount|null {
    const account = accountID ? this.wallet.accounts.find(a => a.id === accountID) || null : null;
    this.wallet.selectedAccountId = account?.id || null;
    this.wallet.selectedAccount = account;
    this.wallet.selectedAccount$.next(account);
    this.publishWalletState();
    return account;
  }

  /** Sort regular accounts by derivation index and publish the new order. */
  sortAccountsByIndex(): void {
    this.wallet.accounts.sort((a, b) => a.index - b.index);
    this.publishWalletState();
  }

  getWalletAccount(accountID) {
    return this.wallet.accounts.find(a => a.id === accountID);
  }


  async patchOldSavedData() {
    // Look for saved accounts using an xrb_ prefix
    const walletData = localStorage.getItem(this.storeKey);
    if (!walletData) return;

    const walletJson = JSON.parse(walletData);

    if (walletJson.accounts) {
      const newAccounts = walletJson.accounts.map(account => {
        if (account.id.indexOf('xrb_') !== -1) {
          account.id = account.id.replace('xrb_', 'nano_');
        }
        return account;
      });

      walletJson.accounts = newAccounts;
    }

    localStorage.setItem(this.storeKey, JSON.stringify(walletJson));

    return;
  }

  async loadStoredWallet() {
    this.resetWallet();

    const walletData = localStorage.getItem(this.storeKey);
    if (!walletData) return this.wallet;

    const walletJson = JSON.parse(walletData);
    const walletType: WalletType = walletJson.type || 'seed';
    if (walletType === 'seed' || walletType === 'privateKey' || walletType === 'expandedKey') {
      this.commitLifecycle({ kind: 'locked', type: walletType, encryptedSecret: walletJson.seed });
    }
    if (walletType === 'ledger') {
      this.commitLifecycle({ kind: 'ledger' });
    }

    if (walletJson.accounts && walletJson.accounts.length) {
      await Promise.all(walletJson.accounts.map(async account => {
        const loaded = await this.loadWalletAccount(account.index, account.id);
          if (account.nonStandardIndex) loaded.nonStandardIndex = true;
      }));
    }

    this.wallet.selectedAccountId = walletJson.selectedAccountId || null;

    return this.wallet;
  }

  // Using full list of indexes is the latest standard with back compatability with accountsIndex
  async loadImportedWallet(seed: string, password: string, accountsIndex: number, indexes: Array<number>, walletType: WalletType) {
    this.resetWallet();

    // Clear NanoNym data (must happen before wallet seed is cleared)
    if (FEATURE_NANONYMS) {
      try {
        const nanonymManager = this.injector.get(NanoNymManagerService);
        nanonymManager.resetAll();
      } catch (error) {
        console.warn('Could not reset NanoNym data:', error);
      }
    }

    if (walletType !== 'seed' && walletType !== 'privateKey' && walletType !== 'expandedKey') return false;
    this.commitLifecycle({ kind: 'unlocked', type: walletType, secret: seed, secretBytes: this.util.hex.toUint8(seed), password });

    if (walletType === 'seed') {
      // Old method
      if (accountsIndex > 0) {
        for (let i = 0; i < accountsIndex; i++) {
          await this.addWalletAccount(i, false);
        }
      } else if (indexes) {
        // New method (the promise ensures all wallets have been added before moving on)
        await Promise.all(indexes.map(async (i) => {
          await this.addWalletAccount(i, false);
        }));
      } else return false;
    } else if (walletType === 'privateKey' || walletType === 'expandedKey') {
      this.wallet.accounts.push(this.createSingleKeyAccount(walletType === 'expandedKey'));
    }

    await this.reloadBalances();

    if (this.wallet.accounts.length) {
      this.websocket.subscribeAccounts(this.wallet.accounts.map(a => a.id));
    }

    return true;
  }

  generateExportData() {
    const exportData: any = {
      indexes: this.wallet.accounts.map(a => a.index),
    };
    let secret = '';
    if (this.lifecycleState.kind === 'locked') secret = this.lifecycleState.encryptedSecret;
    if (this.lifecycleState.kind === 'unlocked') secret = CryptoJS.AES.encrypt(this.lifecycleState.secret, this.lifecycleState.password).toString();

    if (this.softwareType() === 'seed') {
      exportData.seed = secret;
    } else if (this.softwareType() === 'privateKey') {
      exportData.privateKey = secret;
    } else if (this.softwareType() === 'expandedKey') {
      exportData.expandedKey = secret;
    }

    return exportData;
  }

  generateExportUrl() {
    const exportData = this.generateExportData();
    const base64Data = btoa(JSON.stringify(exportData));

    return `${environment.publicUrl}/import-wallet#${base64Data}`;
  }

  lockWallet() {
    const state = this.unlockedState();
    if (!state || !state.secret || !state.password) return false;
    const encryptedSecret = CryptoJS.AES.encrypt(state.secret, state.password).toString();

    this.wallet.accounts.forEach(a => {
      this.clearBytes(a.secret instanceof Uint8Array ? a.secret : null);
      a.keyPair = null;
      a.secret = null;
    });
    this.clearBytes(state.secretBytes);
    this.commitLifecycle({ kind: 'locked', type: state.type, encryptedSecret });
    try {
      this.saveWalletExport();
    } catch (error) {
      this.notifications.sendError('Wallet locked, but could not save encrypted wallet data.');
    }
    return true;
  }
  unlockWallet(password: string) {
    try {
      if (this.lifecycleState.kind !== 'locked') return false;
      const locked = this.lifecycleState;
      const decryptedBytes = CryptoJS.AES.decrypt(locked.encryptedSecret, password);
      const decryptedSeed = decryptedBytes.toString(CryptoJS.enc.Utf8);
      if (!/^[0-9a-f]{64}$/i.test(decryptedSeed)) return false;
      const secretBytes = this.util.hex.toUint8(decryptedSeed);
      const credentials = this.wallet.accounts.map(a => {
        let secret: Uint8Array;
        let keyPair: any;
        if (locked.type !== 'seed') {
          secret = secretBytes;
          keyPair = this.util.account.generateAccountKeyPair(secret, locked.type === 'expandedKey');
          return { account: a, secret, keyPair, nonStandardIndex: a.nonStandardIndex };
        }

        if (this.util.account.isNonStandardAccountIndex(a.index)) {
          secret = this.util.account.generateAccountSecretKeyBytes(secretBytes, a.index, true);
          keyPair = this.util.account.generateAccountKeyPair(secret);
          const derivedAddress = this.util.account.getPublicAccountID(keyPair.publicKey);
          if (derivedAddress !== a.id) {
            console.error(`[Migration] Non-standard account index ${a.index}: derived address ${derivedAddress} does not match stored ${a.id}`);
          } else {
            console.warn(`[Migration] Account at non-standard index ${a.index} verified — derived address matches. Consider migrating funds to a standard index.`);
          }
        } else {
          secret = this.util.account.generateAccountSecretKeyBytes(secretBytes, a.index);
          keyPair = this.util.account.generateAccountKeyPair(secret);
        }
        return { account: a, secret, keyPair, nonStandardIndex: this.util.account.isNonStandardAccountIndex(a.index) || a.nonStandardIndex };
      });

      credentials.forEach(({ account, secret, keyPair, nonStandardIndex }) => {
        account.secret = secret;
        account.keyPair = keyPair;
        account.nonStandardIndex = nonStandardIndex;
      });
      this.commitLifecycle({ kind: 'unlocked', type: locked.type, secret: decryptedSeed, secretBytes, password });

      const nonStandardCount = this.wallet.accounts.filter(acct => acct.nonStandardIndex).length;
      if (nonStandardCount > 0) {
        this.notifications.sendWarning(
          `${nonStandardCount} account(s) use non-standard derivation indices. ` +
          `Please send their funds to standard accounts and remove them.`,
          { length: 0, identifier: 'non-standard-index' }
        );
        // Publish the lifecycle/account metadata change through the snapshot.
        this.publishWalletState();
      }

      this.notifications.removeNotification('pending-locked'); // If there is a notification to unlock, remove it

      // Process any pending blocks
      this.processPendingBlocks();

      return true;
    } catch (err) {
      return false;
    }
  }

  async createWalletFromSeed(seed: string) {
    this.resetWallet();

    // Clear NanoNym data (must happen before wallet seed is cleared)
    if (FEATURE_NANONYMS) {
      try {
        const nanonymManager = this.injector.get(NanoNymManagerService);
        nanonymManager.resetAll();
      } catch (error) {
        console.warn('Could not reset NanoNym data:', error);
      }
    }

    this.commitLifecycle({ kind: 'unlocked', type: 'seed', secret: seed, secretBytes: this.util.hex.toUint8(seed), password: '' });

    await this.scanAccounts();
  }

  async scanAccounts() {
    const usedIndices = [];

    const NAULT_ACCOUNTS_LIMIT = 20;
    const ACCOUNTS_PER_API_REQUEST = 10;

    const batchesCount = NAULT_ACCOUNTS_LIMIT / ACCOUNTS_PER_API_REQUEST;

    // Getting accounts...
    for (let batchIdx = 0; batchIdx < batchesCount; batchIdx++) {
      const batchAccounts = {};
      const batchAccountsArray = [];
      for (let i = 0; i < ACCOUNTS_PER_API_REQUEST; i++) {
        const index = batchIdx * ACCOUNTS_PER_API_REQUEST + i;

        let accountAddress = '';
        let accountPublicKey = '';

        if (this.softwareType() === 'seed') {
          const accountBytes = this.util.account.generateAccountSecretKeyBytes(this.unlockedState().secretBytes, index);
          const accountKeyPair = this.util.account.generateAccountKeyPair(accountBytes);
          accountPublicKey = this.util.uint8.toHex(accountKeyPair.publicKey).toUpperCase();
          accountAddress = this.util.account.getPublicAccountID(accountKeyPair.publicKey);

        } else if (this.isLedgerWallet()) {
          const account: any = await this.ledgerService.getLedgerAccount(index);
          accountAddress = account.address.replace('xrb_', 'nano_');
          accountPublicKey = account.publicKey.toUpperCase();

        } else {
          return false;
        }

        batchAccounts[accountAddress] = {
          index: index,
          publicKey: accountPublicKey,
        };
        batchAccountsArray.push(accountAddress);
      }

      // Checking frontiers...
      const batchResponse = await this.api.accountsFrontiers(batchAccountsArray);
      if (batchResponse) {
        for (const accountID in batchResponse.frontiers) {
          if (batchResponse.frontiers.hasOwnProperty(accountID)) {
            const frontier = batchResponse.frontiers[accountID];
            const frontierIsValidHash = this.util.nano.isValidHash(frontier);

            if (frontierIsValidHash === true) {
              if (frontier !== batchAccounts[accountID].publicKey) {
                usedIndices.push(batchAccounts[accountID].index);
              }
            }
          }
        }
      }
    }

    // Add accounts
    if (usedIndices.length > 0) {
      for (const index of usedIndices) {
        await this.addWalletAccount(index, false);
      }
    } else {
      await this.addWalletAccount(0, false);
    }

    // Reload balances for all accounts
    this.reloadBalances();
  }

  async createNewWallet(seed: string) {
    this.resetWallet();

    // Clear NanoNym data (must happen before wallet seed is cleared)
    if (FEATURE_NANONYMS) {
      try {
        const nanonymManager = this.injector.get(NanoNymManagerService);
        nanonymManager.resetAll();
      } catch (error) {
        console.warn('Could not reset NanoNym data:', error);
      }
    }

    this.commitLifecycle({ kind: 'unlocked', type: 'seed', secret: seed, secretBytes: this.util.hex.toUint8(seed), password: '' });
    await this.addWalletAccount();
    return seed;
  }

  async createLedgerWallet() {
    // this.resetWallet(); Now done earlier to ensure user not sending to wrong account
    this.resetWallet();

    // Clear NanoNym data (must happen before wallet seed is cleared)
    if (FEATURE_NANONYMS) {
      try {
        const nanonymManager = this.injector.get(NanoNymManagerService);
        nanonymManager.resetAll();
      } catch (error) {
        console.warn('Could not reset NanoNym data:', error);
      }
    }

    this.commitLifecycle({ kind: 'ledger' });

    await this.scanAccounts();

    return this.wallet;
  }

  async createWalletFromSingleKey(key: string, expanded: boolean) {
    this.resetWallet();

    // Clear NanoNym data (must happen before wallet seed is cleared)
    if (FEATURE_NANONYMS) {
      try {
        const nanonymManager = this.injector.get(NanoNymManagerService);
        nanonymManager.resetAll();
      } catch (error) {
        console.warn('Could not reset NanoNym data:', error);
      }
    }

    this.commitLifecycle({ kind: 'unlocked', type: expanded ? 'expandedKey' : 'privateKey', secret: key, secretBytes: this.util.hex.toUint8(key), password: '' });

    this.wallet.accounts.push(this.createSingleKeyAccount(expanded));
    await this.reloadBalances();
    this.saveWalletExport();
  }

  async createLedgerAccount(index) {
    const account: any = await this.ledgerService.getLedgerAccount(index);

    const accountID = account.address;
    const nanoAccountID = accountID.replace('xrb_', 'nano_');
    const addressBookName = this.addressBook.getAccountName(nanoAccountID);

    const newAccount: WalletAccount = {
      id: nanoAccountID,
      frontier: null,
      secret: null,
      keyPair: null,
      balance: new BigNumber(0),
      pending: new BigNumber(0),
      balanceRaw: new BigNumber(0),
      pendingRaw: new BigNumber(0),
      balanceFiat: 0,
      pendingFiat: 0,
      index: index,
      addressBookName,
      receivePow: false,
    };

    return newAccount;
  }

  createKeyedAccount(index, accountBytes, accountKeyPair) {
    const accountName = this.util.account.getPublicAccountID(accountKeyPair.publicKey);
    const addressBookName = this.addressBook.getAccountName(accountName);

    const newAccount: WalletAccount = {
      id: accountName,
      frontier: null,
      secret: accountBytes,
      keyPair: accountKeyPair,
      balance: new BigNumber(0),
      pending: new BigNumber(0),
      balanceRaw: new BigNumber(0),
      pendingRaw: new BigNumber(0),
      balanceFiat: 0,
      pendingFiat: 0,
      index: index,
      addressBookName,
      receivePow: false,
    };

    return newAccount;
  }

  async createSeedAccount(index) {
    console.debug(`[Derivation] Regular Nano account - Index: ${index} (BLAKE2b derivation)`);
    const state = this.unlockedState();
    if (!state || state.type !== 'seed') throw new Error('Seed wallet is locked');
    const accountBytes = this.util.account.generateAccountSecretKeyBytes(state.secretBytes, index);
    const accountKeyPair = this.util.account.generateAccountKeyPair(accountBytes);
    return this.createKeyedAccount(index, accountBytes, accountKeyPair);
  }

  createSingleKeyAccount(expanded: boolean) {
    const state = this.unlockedState();
    if (!state) throw new Error('Single-key wallet is locked');
    const accountBytes = state.secretBytes;
    const accountKeyPair = this.util.account.generateAccountKeyPair(accountBytes, expanded);
    return this.createKeyedAccount(0, accountBytes, accountKeyPair);
  }

  /**
   * Reset wallet to a base state, without changing reference to the main object
   */
  resetWallet() {
    if (this.wallet.accounts.length) {
      this.websocket.unsubscribeAccounts(this.wallet.accounts.map(a => a.id)); // Unsubscribe from old accounts
      this.wallet.accounts.forEach(account => {
        this.clearBytes(account.secret instanceof Uint8Array ? account.secret : null);
        account.secret = null;
        account.keyPair = null;
      });
    }

    const state = this.unlockedState();
    if (state) this.clearBytes(state.secretBytes);
    this.commitLifecycle({ kind: 'empty' }, false);
    this.wallet.accounts = [];
    this.wallet.balance = new BigNumber(0);
    this.wallet.pending = new BigNumber(0);
    this.wallet.balanceRaw = new BigNumber(0);
    this.wallet.pendingRaw = new BigNumber(0);
    this.wallet.balanceFiat = 0;
    this.wallet.pendingFiat = 0;
    this.wallet.hasPending = false;
    this.wallet.selectedAccountId = null;
    this.wallet.selectedAccount = null;
    this.wallet.selectedAccount$.next(null);
    this.wallet.pendingBlocks = [];
    this.publishWalletState({ status: 'idle', reason: 'reset' });
  }

  isConfigured = () => {
    return this.lifecycleState.kind !== 'empty';
  };

  isLocked() {
    return this.lifecycleState.kind === 'locked';
  }

  isLedgerWallet() {
    return this.lifecycleState.kind === 'ledger';
  }

  isSingleKeyWallet() {
    const type = this.softwareType();
    return type === 'privateKey' || type === 'expandedKey';
  }

  getWalletType(): WalletType|null { return this.lifecycleSnapshot().type; }
  hasPassword(): boolean { return this.unlockedState()?.password.length > 0; }
  getRecoverySecret(): string|null { return this.unlockedState()?.secret || null; }

  changePassword(password: string): boolean {
    const state = this.unlockedState();
    if (!state || !password) return false;
    const candidate = { ...state, password };
    try {
      this.persistWalletExport(this.generateWalletExportFor(candidate));
    } catch (error) {
      this.notifications.sendError('Unable to save the new wallet password.');
      return false;
    }
    this.commitLifecycle(candidate);
    return true;
  }

  hasPendingTransactions() {
    return this.wallet.hasPending;
    // if (this.appSettings.settings.minimumReceive) {
    //   return this.wallet.hasPending;
    // } else {
    //   return this.wallet.pendingRaw.gt(0);
    // }
  }

  reloadFiatBalances() {
    const fiatPrice = this.price.price.lastPrice;

    this.wallet.accounts.forEach(account => {
      account.balanceFiat = this.util.nano.rawToMnano(account.balance).times(fiatPrice).toNumber();
      account.pendingFiat = this.util.nano.rawToMnano(account.pending).times(fiatPrice).toNumber();
    });

    this.wallet.balanceFiat = this.util.nano.rawToMnano(this.wallet.balance).times(fiatPrice).toNumber();
    this.wallet.pendingFiat = this.util.nano.rawToMnano(this.wallet.pending).times(fiatPrice).toNumber();
    this.publishWalletState();
  }

  resetBalances() {
    this.wallet.balance = new BigNumber(0);
    this.wallet.pending = new BigNumber(0);
    this.wallet.balanceRaw = new BigNumber(0);
    this.wallet.pendingRaw = new BigNumber(0);
    this.wallet.balanceFiat = 0;
    this.wallet.pendingFiat = 0;
    this.wallet.hasPending = false;
  }

  async reloadBalances() {
    return this.refreshWalletState('reload-balances');
  }

  private async reloadBalancesFromNode() {
    this.wallet.updatingBalance = true;
    const fiatPrice = this.price.price.lastPrice;

    const accountIDs = this.wallet.accounts.map(a => a.id);
    const accounts = await this.api.accountsBalances(accountIDs);
    const frontiers = await this.api.accountsFrontiers(accountIDs);
    if (!accounts) {
      // Commit the empty response only after both account RPCs have succeeded.
      this.resetBalances();
      this.wallet.updatingBalance = false;
      this.wallet.balanceInitialized = true;
      return;
    }

    // Build the complete next state off to the side. Legacy consumers keep
    // seeing the previous coherent wallet until this bundle is ready.
    const accountDrafts = new Map(this.wallet.accounts.map(account => [account.id, {
      balance: new BigNumber(account.balance || 0),
      balanceRaw: new BigNumber(account.balanceRaw || 0),
      balanceFiat: account.balanceFiat,
      frontier: account.frontier,
      pending: new BigNumber(account.pending || 0),
      pendingRaw: new BigNumber(account.pendingRaw || 0),
      pendingFiat: account.pendingFiat,
      receivePow: account.receivePow,
    }]));
    const pendingBlocks: Block[] = [];
    let walletBalance = new BigNumber(0);
    let walletPendingInclUnconfirmed = new BigNumber(0);
    let walletPendingAboveThresholdConfirmed = new BigNumber(0);

    // Receivables are replaced by this authoritative response, not merged
    // with the previous query's values.
    for (const draft of accountDrafts.values()) {
      draft.balance = new BigNumber(0);
      draft.balanceRaw = new BigNumber(0);
      draft.balanceFiat = 0;
      draft.frontier = null;
      draft.pending = new BigNumber(0);
      draft.pendingRaw = new BigNumber(0);
      draft.pendingFiat = 0;
      draft.receivePow = false;
    }

    for (const accountID in accounts.balances) {
      if (!accounts.balances.hasOwnProperty(accountID)) continue;

      const walletAccount = this.wallet.accounts.find(a => a.id === accountID);
      const draft = accountDrafts.get(accountID);
      if (!walletAccount || !draft) continue;

      draft.balance = new BigNumber(accounts.balances[accountID].balance || 0);
      const accountBalancePendingInclUnconfirmed = new BigNumber(accounts.balances[accountID].pending || 0);
      draft.balanceRaw = new BigNumber(draft.balance).mod(this.nano);
      draft.balanceFiat = this.util.nano.rawToMnano(draft.balance).times(fiatPrice).toNumber();

      const walletAccountFrontier = frontiers.frontiers?.[accountID];
      draft.frontier = this.util.nano.isValidHash(walletAccountFrontier) ? walletAccountFrontier : null;
      walletBalance = walletBalance.plus(draft.balance);
      walletPendingInclUnconfirmed = walletPendingInclUnconfirmed.plus(accountBalancePendingInclUnconfirmed);
    }

    if (walletPendingInclUnconfirmed.gt(0)) {
      const pending = this.appSettings.settings.minimumReceive
        ? await this.api.accountsPendingLimitSorted(
          this.wallet.accounts.map(a => a.id),
          this.util.nano.mnanoToRaw(this.appSettings.settings.minimumReceive).toString(10)
        )
        : await this.api.accountsPendingSorted(this.wallet.accounts.map(a => a.id));

      if (pending?.blocks) {
        for (const accountID in pending.blocks) {
          if (!pending.blocks.hasOwnProperty(accountID)) continue;
          const walletAccount = this.wallet.accounts.find(a => a.id === accountID);
          const draft = accountDrafts.get(accountID);
          if (!walletAccount || !draft) continue;

          let accountPending = new BigNumber(0);
          for (const hash in pending.blocks[accountID]) {
            if (!pending.blocks[accountID].hasOwnProperty(hash)) continue;
            const pendingBlock = pending.blocks[accountID][hash];
            pendingBlocks.push({ account: accountID, hash, amount: pendingBlock.amount, source: pendingBlock.source });
            accountPending = accountPending.plus(pendingBlock.amount);
          }

          draft.pending = accountPending;
          draft.pendingRaw = accountPending.mod(this.nano);
          draft.pendingFiat = this.util.nano.rawToMnano(accountPending).times(fiatPrice).toNumber();
          draft.receivePow = accountPending.gt(0);
          walletPendingAboveThresholdConfirmed = walletPendingAboveThresholdConfirmed.plus(accountPending);
        }
      }
    }

    // The staged bundle is complete. Commit all account/totals/pending changes
    // synchronously, then notify legacy observers as one coherent transition.
    this.wallet.accounts.forEach(account => {
      const draft = accountDrafts.get(account.id);
      if (!draft) return;
      Object.assign(account, draft);
    });
    this.clearPendingBlocks();
    pendingBlocks.forEach(block => this.addPendingBlock(block.account, block.hash, block.amount, block.source));

    this.workPool.syncAccountRoots(this.wallet.accounts.map(account => ({
      account: account.id,
      root: account.frontier || this.util.account.getAccountPublicKey(account.id),
      multiplier: account.frontier ? 1 : 1 / 64,
      priority: 10,
      purpose: account.frontier ? 'frontier' as const : 'receive-open' as const,
    })));

    this.wallet.balance = walletBalance;
    this.wallet.pending = walletPendingAboveThresholdConfirmed;
    this.wallet.balanceRaw = new BigNumber(walletBalance).mod(this.nano);
    this.wallet.pendingRaw = new BigNumber(walletPendingAboveThresholdConfirmed).mod(this.nano);
    this.wallet.balanceFiat = this.util.nano.rawToMnano(walletBalance).times(fiatPrice).toNumber();
    this.wallet.pendingFiat = this.util.nano.rawToMnano(walletPendingAboveThresholdConfirmed).times(fiatPrice).toNumber();
    this.wallet.hasPending = walletPendingAboveThresholdConfirmed.gt(0);
    this.wallet.updatingBalance = false;
    this.wallet.balanceInitialized = true;

  }

  async loadWalletAccount(accountIndex, accountID) {
    const index = accountIndex;
    const addressBookName = this.addressBook.getAccountName(accountID);

    const newAccount: WalletAccount = {
      id: accountID,
      frontier: null,
      secret: null,
      keyPair: null,
      balance: new BigNumber(0),
      pending: new BigNumber(0),
      balanceRaw: new BigNumber(0),
      pendingRaw: new BigNumber(0),
      balanceFiat: 0,
      pendingFiat: 0,
      index: index,
      addressBookName,
      receivePow: false,
    };

    this.wallet.accounts.push(newAccount);
    this.websocket.subscribeAccounts([accountID]);
    this.publishWalletState();

    return newAccount;
  }

  async addWalletAccount(accountIndex: number|null = null, reloadBalances: boolean = true) {
    // if (!this.wallet.seedBytes) return;
    let index = accountIndex;
    if (index === null) {
      index = 0; // Use the existing number, then increment it

      // Make sure the index is not being used (ie. if you delete acct 3/5, then press add twice, it goes 3, 6, 7)
      while (this.wallet.accounts.find(a => a.index === index)) index++;
    }

    let newAccount: WalletAccount|null;

    if (this.isSingleKeyWallet()) {
      throw new Error(`Wallet consists of a single private key.`);
    } else if (this.softwareType() === 'seed') {
      if (this.util.account.isNonStandardAccountIndex(index)) {
        throw new Error(
          `Account index ${index} is out of range (0-${this.util.account.ACCOUNT_INDEX_MAX}). ` +
          `Please choose a valid index.`
        );
      }
      newAccount = await this.createSeedAccount(index);
    } else if (this.isLedgerWallet()) {
      try {
        newAccount = await this.createLedgerAccount(index);
      } catch (err) {
        // this.notifications.sendWarning(`Unable to load account from ledger.  Make sure it is connected`);
        throw err;
      }

    }

    this.wallet.accounts.push(newAccount);
    this.publishWalletState();

    if (reloadBalances) await this.reloadBalances();

    this.websocket.subscribeAccounts([newAccount.id]);

    this.saveWalletExport();

    return newAccount;
  }

  async removeWalletAccount(accountID: string) {
    const walletAccount = this.getWalletAccount(accountID);
    if (!walletAccount) throw new Error(`Account is not in wallet`);

    const walletAccountIndex = this.wallet.accounts.findIndex(a => a.id === accountID);
    if (walletAccountIndex === -1) throw new Error(`Account is not in wallet`);

    this.wallet.accounts.splice(walletAccountIndex, 1);
    this.publishWalletState();

    this.websocket.unsubscribeAccounts([accountID]);

    // Reload the balances, save new wallet state
    await this.reloadBalances();
    this.saveWalletExport();

    return true;
  }

  async trackAddress(address: string) {
    this.websocket.subscribeAccounts([address]);
    console.log('Tracking transactions on ' + address);
  }

  async untrackAddress(address: string) {
    this.websocket.unsubscribeAccounts([address]);
    console.log('Stopped tracking transactions on ' + address);
  }

  addPendingBlock(accountID, blockHash, amount, source) {
    if (this.successfulBlocks.indexOf(blockHash) !== -1) return false; // Already successful with this block

    const existingHash = this.wallet.pendingBlocks.find(b => b.hash === blockHash);

    if (existingHash) return false; // Already added

    this.wallet.pendingBlocks.push({ account: accountID, hash: blockHash, amount: amount, source: source });
    this.wallet.pendingBlocksUpdate$.next({
      account: accountID,
      sourceHash: blockHash,
      destinationHash: null,
      hasBeenReceived: false,
    });
    this.wallet.pendingBlocksUpdate$.next(null);
    this.publishWalletState();
    return true;
  }

  // Remove a pending account from the pending list
  async removePendingBlock(blockHash) {
    const index = this.wallet.pendingBlocks.findIndex(b => b.hash === blockHash);
    if (index !== -1) {
      this.wallet.pendingBlocks.splice(index, 1);
      this.publishWalletState();
    }
  }

  // Clear the list of pending blocks
  async clearPendingBlocks() {
    this.wallet.pendingBlocks.splice(0, this.wallet.pendingBlocks.length);
    this.publishWalletState();
  }

  sortByAmount(a, b) {
    const x = new BigNumber(a.amount);
    const y = new BigNumber(b.amount);
    return y.comparedTo(x);
  }

  async processPendingBlocks() {
    if (this.processingPending || this.isLocked() || !this.wallet.pendingBlocks.length || this.appSettings.settings.pendingOption === 'manual') return;

    // Sort pending by amount
    if (this.appSettings.settings.pendingOption === 'amount') {
      this.wallet.pendingBlocks.sort(this.sortByAmount);
    }

    this.processingPending = true;

    const nextBlock = this.wallet.pendingBlocks[0];
    if (this.successfulBlocks.find(b => b.hash === nextBlock.hash)) {
      return setTimeout(() => this.processPendingBlocks(), 1500); // Block has already been processed
    }
    const walletAccount = this.getWalletAccount(nextBlock.account);
    if (!walletAccount) {
      this.processingPending = false;
      return; // Dispose of the block, no matching account
    }

    const newHash = await this.nanoBlock.generateReceive(walletAccount, nextBlock.hash, this.isLedgerWallet());
    if (newHash) {
      if (this.successfulBlocks.length >= 15) this.successfulBlocks.shift();
      this.successfulBlocks.push(nextBlock.hash);

      const receiveAmount = this.util.nano.rawToMnano(nextBlock.amount);
      this.notifications.removeNotification('success-receive');
      this.notifications.sendSuccess(`Successfully received ${receiveAmount.isZero() ? '' : this.noZerosPipe.transform(receiveAmount.toFixed(6)) } XNO!`, { identifier: 'success-receive' });

      // remove after processing
      // list also updated with reloadBalances but not if called too fast
      this.removePendingBlock(nextBlock.hash);
      await this.reloadBalances();
      this.wallet.pendingBlocksUpdate$.next({
        account: nextBlock.account,
        sourceHash: nextBlock.hash,
        destinationHash: newHash,
        hasBeenReceived: true,
      });
      this.wallet.pendingBlocksUpdate$.next(null);
    } else {
      if (this.isLedgerWallet()) {
        this.processingPending = false;
        return null; // Denied to receive, stop processing
      }
      this.processingPending = false;
      return this.notifications.sendError(`There was a problem receiving the transaction, try manually!`, {length: 10000});
    }

    this.processingPending = false;

    setTimeout(() => this.processPendingBlocks(), 1500);
  }

  saveWalletExport() {
    if (this.lifecycleState.kind === 'unlocked' && !this.lifecycleState.password) return;
    this.persistWalletExport(this.generateWalletExport());
  }

  private persistWalletExport(exportData: any) {

    switch (this.appSettings.settings.walletStore) {
      case 'none':
        this.removeWalletData();
        break;
      default:
      case 'localStorage':
        localStorage.setItem(this.storeKey, JSON.stringify(exportData));
        break;
    }
  }

  removeWalletData() {
    localStorage.removeItem(this.storeKey);

    // Clear NanoNym data
    try {
      const nanonymManager = this.injector.get(NanoNymManagerService);
      nanonymManager.resetAll();
    } catch (error) {
      console.warn('Could not reset NanoNym data:', error);
    }
  }

  generateWalletExport() {
    return this.generateWalletExportFor(this.lifecycleState);
  }

  private generateWalletExportFor(state: WalletLifecycleState) {
    const data: any = {
      type: this.lifecycleSnapshot(state).type,
      accounts: this.wallet.accounts.map(a => ({
        id: a.id,
        index: a.index,
        ...(a.nonStandardIndex && { nonStandardIndex: true }),
      })),
      selectedAccountId: this.wallet.selectedAccount ? this.wallet.selectedAccount.id : null,
    };

    if (state.kind === 'ledger') {
    } else {
      if (state.kind === 'unlocked') data.seed = CryptoJS.AES.encrypt(state.secret, state.password).toString();
      if (state.kind === 'locked') data.seed = state.encryptedSecret;
      data.locked = true;
    }

    return data;
  }

  // Run an accountInfo call for each account in the wallet to get their representatives
  async getAccountsDetails(): Promise<WalletApiAccount[]> {
    return await Promise.all(
      this.wallet.accounts.map(account =>
        this.api.accountInfo(account.id)
          .then(res => {
            try {
              res.id = account.id;
              res.addressBookName = account.addressBookName;
            } catch {return null; }

            return res;
          })
      )
    );
  }

  // Subscribable event when a new wallet is created
  informNewWallet() {
    this.wallet.newWallet$.next(true);
    this.wallet.newWallet$.next(false);
  }

  // Subscribable event when balances has been refreshed
  informBalanceRefresh() {
    this.wallet.refresh$.next(true);
    this.wallet.refresh$.next(false);
  }

  requestWalletUnlock() {
    this.wallet.unlockModalRequested$.next(true);

    return new Promise(
      (resolve, reject) => {
        let subscriptionForUnlock;
        let subscriptionForCancel;

        const removeSubscriptions = () => {
          if (subscriptionForUnlock != null) {
            subscriptionForUnlock.unsubscribe();
          }

          if (subscriptionForCancel != null) {
            subscriptionForCancel.unsubscribe();
          }
        };

        subscriptionForUnlock =
          this.lifecycle$.subscribe(async lifecycle => {
            if (lifecycle.kind === 'unlocked' || lifecycle.kind === 'ledger') {
              removeSubscriptions();

              const wasUnlocked = true;
              resolve(wasUnlocked);
            }
          });

        subscriptionForCancel =
          this.wallet.unlockModalRequested$.subscribe(async wasRequested => {
            if (wasRequested === false) {
              removeSubscriptions();

              const wasUnlocked = false;
              resolve(wasUnlocked);
            }
          });
      }
    );
  }

  /**
   * Get all spendable accounts (regular wallet accounts + NanoNym aggregate accounts)
   * Returns a unified view for display on Accounts page and other UIs
   */
  getSpendableAccounts(): SpendableAccount[] {
    // Convert regular wallet accounts to RegularAccount format
    const regularAccounts: RegularAccount[] = this.wallet.accounts.map(account => ({
      type: 'regular' as const,
      id: account.id,
      label: this.util.account.prefixNonStandardLabel(
        account.addressBookName || `Account #${account.index}`,
        account.nonStandardIndex
      ),
      balance: account.balance,
      balanceRaw: account.balanceRaw,
      pending: account.pending,
      balanceFiat: account.balanceFiat,
      index: account.index,
      walletAccount: account
    }));

    if (!FEATURE_NANONYMS || !this.nanoNymStorage) {
      return regularAccounts;
    }

    // Get NanoNym accounts from storage
    const nanoNyms = this.nanoNymStorage.getAllNanoNyms();
    const nanoNymAccounts = nanoNyms.map(nn => {
      const balanceInNano = this.util.nano.rawToMnano(nn.balance);
      const truncatedAddress = nn.nnymAddress.substring(0, 12) + '...' + nn.nnymAddress.substring(nn.nnymAddress.length - 8);

      return {
        type: 'nanonym' as const,
        id: nn.nnymAddress,
        label: nn.label,
        balance: nn.balance,
        balanceRaw: nn.balance,
        pending: new BigNumber(0),
        balanceFiat: balanceInNano.times(this.price.price.lastPrice).toNumber(),
        index: nn.index,
        nanoNym: nn,
        truncatedAddress: truncatedAddress
      };
    });

    return [...regularAccounts, ...nanoNymAccounts];
  }

  /**
   * Get total wallet balance including all NanoNym balances
   * Used for sidebar display and overall balance calculations
   */
  getTotalBalanceIncludingNanoNyms(): BigNumber {
    const regularBalance = this.wallet.balance;
    if (!FEATURE_NANONYMS || !this.nanoNymStorage) {
      return regularBalance;
    }
    const nanoNyms = this.nanoNymStorage.getAllNanoNyms();
    const nanoNymBalance = nanoNyms.reduce(
      (sum, nn) => sum.plus(nn.balance),
      new BigNumber(0)
    );
    return regularBalance.plus(nanoNymBalance);
  }

  /**
   * Reactive observable of all spendable accounts
   * Auto-updates when wallet accounts or NanoNyms change
   */
  get spendableAccounts$(): Observable<SpendableAccount[]> {
    if (FEATURE_NANONYMS && this.nanoNymStorage) {
      return combineLatest([
        this.walletState$,
        this.nanoNymStorage.nanonyms$
      ]).pipe(
        map(() => this.getSpendableAccounts())
      );
    }
    return this.walletState$.pipe(map(() => this.getSpendableAccounts()));
  }

  /**
   * Reactive observable of total balance (regular accounts + NanoNyms)
   * Auto-updates when either regular account balances or NanoNym balances change
   */
  get totalBalance$(): Observable<BigNumber> {
    if (FEATURE_NANONYMS && this.nanoNymStorage) {
      return combineLatest([
        this.walletState$,
        this.nanoNymStorage.nanonyms$
      ]).pipe(
        map(() => this.getTotalBalanceIncludingNanoNyms())
      );
    }
    return this.walletState$.pipe(map(() => this.getTotalBalanceIncludingNanoNyms()));
  }

  /**
   * Reactive observable of total balance in fiat currency
   * Auto-updates when either balance or fiat price changes
   */
  get totalBalanceFiat$(): Observable<number> {
    return combineLatest([
      this.totalBalance$,
      this.price.lastPrice$
    ]).pipe(
      map(([balance, fiatPrice]) => {
        if (!balance || !fiatPrice) return 0;
        return this.util.nano.rawToMnano(balance).times(fiatPrice).toNumber();
      })
    );
  }
}
