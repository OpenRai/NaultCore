import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { WalletContextService } from '../../services/wallet-context.service';
import { WalletAccountSnapshot, WalletService, WalletStateSnapshot } from '../../services/wallet.service';
import { NotificationService } from '../../services/notification.service';
import { TransactionHistoryService } from '../../services/transaction-history.service';
import { AppSettingsService } from '../../services/app-settings.service';
import { TestIds } from '../../testing/test-ids';
import { TransactionIntent } from '../../types/wallet-context.types';
import { WalletTransaction, sortTransactions } from '../../models/transaction.model';

/** The Wallet page shows at most this many merged entries. */
const WALLET_ENTRY_CAP = 25;

@Component({
  selector: 'app-wallet',
  standalone: false,
  styleUrl: './wallet.component.css',
  templateUrl: './wallet.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class WalletComponent implements OnInit, OnDestroy {
  private readonly walletService = inject(WalletService);
  private readonly notifications = inject(NotificationService);
  private readonly walletContext = inject(WalletContextService);
  private readonly history = inject(TransactionHistoryService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);
  readonly settings = inject(AppSettingsService);

  readonly testIds = TestIds;
  readonly walletState$ = this.walletService.walletState$;
  private readonly translate = inject(TranslocoService);

  /**
   * Labels resolved through the injected service rather than the transloco
   * pipe. Most of these feed property bindings, which would re-run the pipe on
   * every change detection pass for text that only changes with the language.
   */
  get labels() {
    return {
      totalBalance: this.translate.translate('wallet.total-balance'),
      acrossAccountsSingular: this.translate.translate('wallet.across-accounts-singular', {
        count: this.walletState.accounts.length,
      }),
      acrossAccountsPlural: this.translate.translate('wallet.across-accounts-plural', {
        count: this.walletState.accounts.length,
      }),
      accounts: this.translate.translate('wallet.accounts'),
      pending: this.translate.translate('wallet.pending'),
      recentEvents: this.translate.translate('wallet.recent-events'),
      spendFrom: this.translate.translate('wallet.spend-from'),
      recentActivity: this.translate.translate('wallet.recent-activity'),
      manageAccounts: this.translate.translate('wallet.manage-accounts'),
    };
  }

  get acrossAccountsLabel(): string {
    return this.walletState.accounts.length === 1
      ? this.labels.acrossAccountsSingular
      : this.labels.acrossAccountsPlural;
  }

  walletState: WalletStateSnapshot = this.walletService.walletState;
  transactions: WalletTransaction[] = [];
  activityLoading = true;
  private walletStateSubscription: Subscription | null = null;
  private loadToken = 0;
  private lastLoadedAccountsKey: string | null = null;
  private previousSyncStatus: string | null = null;
  private hasLoadedTransactions = false;
  passkeyOfferDismissed = false;
  passkeySetupInProgress = false;

  get showPasskeyOffer(): boolean {
    return !this.passkeyOfferDismissed && this.walletState.lifecycle.kind === 'unlocked'
      && this.walletService.hasPassword() && this.walletService.canEnrollPasskey
      && this.walletService.getPasskeyCredentials().length === 0;
  }

  dismissPasskeyOffer(): void {
    this.passkeyOfferDismissed = true;
  }

  async setupPasskey(): Promise<void> {
    if (!this.showPasskeyOffer || this.passkeySetupInProgress) return;
    this.passkeySetupInProgress = true;
    try {
      const enabled = await this.walletService.enablePasskeyUnlock();
      if (enabled) this.notifications.sendSuccess('Passkey unlock is ready for this wallet.');
      else this.notifications.sendWarning('Passkey setup did not finish. Your wallet password still works.');
    } catch {
      this.notifications.sendWarning('Passkey setup did not finish. Your wallet password still works.');
    } finally {
      this.passkeySetupInProgress = false;
    }
  }

  ngOnInit(): void {
    this.walletStateSubscription = this.walletState$.subscribe(snapshot => {
      this.walletState = snapshot;
      const key = snapshot.accounts.map(a => a.id).sort().join(',');
      const accountsChanged = key !== this.lastLoadedAccountsKey;
      const syncCompleted = snapshot.sync.status === 'ready' && this.previousSyncStatus === 'loading';
      this.previousSyncStatus = snapshot.sync.status;
      if (accountsChanged) {
        this.lastLoadedAccountsKey = key;
      }
      if (accountsChanged || syncCompleted) {
        queueMicrotask(() => void this.loadTransactions());
      }
    });
  }

  ngOnDestroy(): void {
    this.walletStateSubscription?.unsubscribe();
    this.loadToken++;
  }

  get selectedAccount(): WalletAccountSnapshot | null {
    return this.walletState.selectedAccount;
  }

  get selectedAccountId(): string {
    return this.walletState.selectedAccountId || '';
  }

  get allPendingBlocks() {
    return this.walletState.pendingBlocks || [];
  }

  /** Distinct accounts for the table's account filter. */
  get accountOptions(): ReadonlyArray<{ id: string; label: string }> {
    return this.walletState.accounts.map(a => ({ id: a.id, label: this.getAccountLabel(a) }));
  }

  get hasAccounts(): boolean {
    return this.walletState.accounts.length > 0;
  }

  /** Avoid presenting startup's zero-filled snapshot as a real balance. */
  get walletDataStatus(): string | null {
    if (!this.walletState.lifecycle.configured || this.walletState.sync.status === 'ready' || this.walletState.sync.hasSnapshot) return null;
    return this.walletState.sync.status === 'error' ? 'Unavailable' : 'Loading…';
  }

  getAccountLabel(account: WalletAccountSnapshot): string {
    return account.addressBookName || `Account #${account.index}`;
  }

  truncateAddress(address: string | null): string {
    if (!address) return '';
    if (address.length <= 20) return address;
    return `${address.slice(0, 10)}…${address.slice(-8)}`;
  }

  selectAccount(accountId: string): void {
    this.walletContext.selectAccount(accountId || null);
  }

  requestWalletUnlock(): void {
    if (!this.walletService.isLocked()) return;
    void this.walletService.requestWalletUnlock();
  }

  async openReceive(): Promise<void> {
    if (this.walletService.isLocked()) {
      const unlocked = await this.walletService.requestWalletUnlock();
      if (!unlocked) return;
    }
    this.openTransaction('receive');
  }

  openTransaction(intent: TransactionIntent): void {
    const target = this.walletContext.transaction(intent, this.selectedAccountId || null);
    this.router.navigateByUrl(this.router.createUrlTree([...target.commands], { queryParams: target.queryParams }));
  }

  /**
   * Loads history for every account, folds in pending receives, then caps.
   *
   * The cap is applied after merging so a wallet with many accounts still shows
   * its true most-recent activity rather than whichever account happens to sort
   * first.
   */
  async loadTransactions(): Promise<void> {
    const token = ++this.loadToken;
    const accounts = this.walletState.accounts;
    if (!accounts.length) {
      this.transactions = [];
      const walletHydrating = this.walletState.lifecycle.configured
        && this.walletState.sync.status !== 'ready'
        && this.walletState.sync.status !== 'error';
      this.activityLoading = walletHydrating;
      this.cdr.markForCheck();
      return;
    }

    this.activityLoading = !this.hasLoadedTransactions;
    this.cdr.markForCheck();
    const accountIds = accounts.map(a => a.id);
    const cachedRows = this.history.cachedRowsForAccounts(accountIds);
    const freshRows = this.history.rowsForAccounts(accountIds);
    void cachedRows.then(rowsByAccount => {
      if (token !== this.loadToken || !Array.from(rowsByAccount.values()).some(rows => rows.length > 0)) return;
      // On refresh, keep the current rows until the authoritative request
      // finishes; cached data can predate a just-confirmed receive.
      if (this.hasLoadedTransactions) return;
      this.applyTransactionRows(rowsByAccount);
      this.hasLoadedTransactions = true;
      this.activityLoading = false;
      this.cdr.markForCheck();
    }).catch(() => undefined);

    try {
      const rowsByAccount = await freshRows;
      if (token !== this.loadToken) return;
      this.applyTransactionRows(rowsByAccount);
      this.hasLoadedTransactions = true;
    } catch {
      if (token === this.loadToken) {
        this.transactions = [];
        this.hasLoadedTransactions = true;
      }
    } finally {
      if (token === this.loadToken) {
        this.activityLoading = false;
        this.cdr.markForCheck();
      }
    }
  }

  private applyTransactionRows(rowsByAccount: Map<string, any[]>): void {
    const merged: WalletTransaction[] = [];
    for (const account of this.walletState.accounts) {
      merged.push(
        ...this.history.toTransactions(
          rowsByAccount.get(account.id) ?? [],
          account.id,
          this.getAccountLabel(account),
          this.allPendingBlocks,
        ),
      );
    }
    const transactions = sortTransactions(merged).slice(0, WALLET_ENTRY_CAP);
    const update = () => {
      this.transactions = transactions;
      this.cdr.detectChanges();
    };
    const supportsMotion = typeof document !== 'undefined'
      && typeof document.startViewTransition === 'function'
      && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (this.hasLoadedTransactions && supportsMotion) {
      document.startViewTransition(update);
    } else {
      this.transactions = transactions;
      this.cdr.markForCheck();
    }
  }
}
