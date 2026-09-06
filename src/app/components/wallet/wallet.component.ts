import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { ApiService } from '../../services/api.service';
import { WalletContextService } from '../../services/wallet-context.service';
import { WalletAccountSnapshot, WalletService, WalletStateSnapshot } from '../../services/wallet.service';
import { AppSettingsService } from '../../services/app-settings.service';
import { TestIds } from '../../testing/test-ids';
import { TransactionIntent } from '../../types/wallet-context.types';
import { RaiPipe } from '../../pipes/rai.pipe';
import BigNumber from 'bignumber.js';

interface WalletActivityItem {
  hash: string;
  direction: 'sent' | 'received';
  amount: BigNumber;
  counterparty: string | null;
  timestamp: number | null;
  confirmed: boolean;
}

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
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  readonly settings = inject(AppSettingsService);

  readonly testIds = TestIds;
  readonly walletState$ = this.walletService.walletState$;
  readonly featureNanonyms = FEATURE_NANONYMS;
  private readonly amountPipe = new RaiPipe();

  walletState: WalletStateSnapshot = this.walletService.walletState;
  activity: WalletActivityItem[] = [];
  activityLoading = false;
  private walletStateSubscription: Subscription | null = null;
  private activityAccountId: string | null = null;
  private activityRequest = 0;

  ngOnInit(): void {
    this.walletStateSubscription = this.walletState$.subscribe(snapshot => {
      this.walletState = snapshot;
      if (snapshot.selectedAccountId !== this.activityAccountId) {
        this.activityAccountId = snapshot.selectedAccountId;
        void this.loadActivity(snapshot.selectedAccount);
      }
    });
  }

  ngOnDestroy(): void {
    this.walletStateSubscription?.unsubscribe();
    this.activityRequest++;
  }

  get selectedAccount(): WalletAccountSnapshot | null {
    return this.walletState.selectedAccount;
  }

  get selectedAccountId(): string {
    return this.walletState.selectedAccountId || '';
  }

  get selectedPendingBlocks() {
    const accountId = this.walletState.selectedAccountId;
    return accountId
      ? this.walletState.pendingBlocks.filter(block => block.account === accountId)
      : [];
  }

  getAccountLabel(account: WalletAccountSnapshot): string {
    return account.addressBookName || `Account #${account.index}`;
  }

  formatBalancePart(value: BigNumber, part: 0 | 1): string {
    const formatted = this.amountPipe.transform(value, 'mnano,true');
    return formatted.split('.')[part] || '';
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

  activateReceiveFromKeyboard(event: KeyboardEvent): void {
    event.preventDefault();
    this.openReceive();
  }

  openTransaction(intent: TransactionIntent): void {
    const target = this.walletContext.transaction(intent, this.selectedAccountId || null);
    this.router.navigateByUrl(this.router.createUrlTree([...target.commands], { queryParams: target.queryParams }));
  }

  formatActivityDate(timestamp: number | null): string {
    if (!timestamp) return 'Recent';
    return new Date(timestamp * 1000).toLocaleDateString();
  }

  private async loadActivity(account: WalletAccountSnapshot | null): Promise<void> {
    const request = ++this.activityRequest;
    if (!account) {
      this.activity = [];
      this.activityLoading = false;
      return;
    }

    this.activityLoading = true;
    try {
      const response = await this.api.accountHistory(account.id, 5, true);
      if (request !== this.activityRequest) return;
      this.activity = Array.isArray(response?.history)
        ? response.history.map(entry => this.toActivityItem(entry))
        : [];
    } catch {
      if (request === this.activityRequest) this.activity = [];
    } finally {
      if (request === this.activityRequest) this.activityLoading = false;
    }
  }

  private toActivityItem(entry: any): WalletActivityItem {
    const direction: WalletActivityItem['direction'] =
      entry.subtype === 'send' || entry.type === 'send' ? 'sent' : 'received';
    return {
      hash: entry.hash || '',
      direction,
      amount: new BigNumber(entry.amount || 0).abs(),
      counterparty: entry.link_as_account || entry.account || null,
      timestamp: entry.local_timestamp ? Number(entry.local_timestamp) : null,
      confirmed: entry.confirmed !== false,
    };
  }
}
