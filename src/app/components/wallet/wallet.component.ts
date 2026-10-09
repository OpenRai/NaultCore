import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { WalletContextService } from '../../services/wallet-context.service';
import { WalletAccountSnapshot, WalletService, WalletStateSnapshot } from '../../services/wallet.service';
import { TransactionHistoryService } from '../../services/transaction-history.service';
import { AppSettingsService } from '../../services/app-settings.service';
import { TestIds } from '../../testing/test-ids';
import { TransactionIntent } from '../../types/wallet-context.types';
import { RaiPipe } from '../../pipes/rai.pipe';
import BigNumber from 'bignumber.js';
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
  private readonly walletContext = inject(WalletContextService);
  private readonly history = inject(TransactionHistoryService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);
  readonly settings = inject(AppSettingsService);

  readonly testIds = TestIds;
  readonly walletState$ = this.walletService.walletState$;
  private readonly amountPipe = new RaiPipe();
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
  activityLoading = false;
  private walletStateSubscription: Subscription | null = null;
  private loadToken = 0;
  private lastLoadedAccountsKey = '';

  ngOnInit(): void {
    this.walletStateSubscription = this.walletState$.subscribe(snapshot => {
      this.walletState = snapshot;
      // Only reload when the account set actually changes; balance updates on
      // their own must not re-fetch history.
      const key = snapshot.accounts.map(a => a.id).sort().join(',');
      if (key !== this.lastLoadedAccountsKey) {
        this.lastLoadedAccountsKey = key;
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

  getAccountLabel(account: WalletAccountSnapshot): string {
    return account.addressBookName || `Account #${account.index}`;
  }

  truncateAddress(address: string | null): string {
    if (!address) return '';
    if (address.length <= 20) return address;
    return `${address.slice(0, 10)}…${address.slice(-8)}`;
  }

  formatAmount(amount: BigNumber | string | number): string {
    return this.amountPipe.transform(amount, 'mnano,true');
  }

  formatFiat(value: number, currency: string): string {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value);
    } catch {
      return `${value} ${currency}`;
    }
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
      this.activityLoading = false;
      this.cdr.markForCheck();
      return;
    }

    this.activityLoading = true;
    this.cdr.markForCheck();
    try {
      const rowsByAccount = await this.history.rowsForAccounts(accounts.map(a => a.id));
      if (token !== this.loadToken) return;

      const merged: WalletTransaction[] = [];
      for (const account of accounts) {
        merged.push(
          ...this.history.toTransactions(
            rowsByAccount.get(account.id) ?? [],
            account.id,
            this.getAccountLabel(account),
            this.allPendingBlocks,
          ),
        );
      }

      this.transactions = sortTransactions(merged).slice(0, WALLET_ENTRY_CAP);
    } catch {
      if (token === this.loadToken) this.transactions = [];
    } finally {
      if (token === this.loadToken) {
        this.activityLoading = false;
        this.cdr.markForCheck();
      }
    }
  }
}