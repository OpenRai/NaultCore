import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit, inject, ChangeDetectionStrategy } from '@angular/core';
import {Subject, timer, Subscription} from 'rxjs';
import {debounce} from 'rxjs/operators';
import {Router} from '@angular/router';
import {
  AppSettingsService,
  LedgerService,
  LedgerStatus,
  ModalService,
  NotificationService,
  RepresentativeService,
  WalletService,
} from '../../services';
import { TranslocoService } from '@jsverse/transloco';
import { SpendableAccount, RegularAccount, NanoNymAccount } from '../../types/spendable-account.types';
import { TestIds } from '../../testing/test-ids';
import { NanoNymStorageService } from '../../services/nanonym-storage.service';
import { NanoNymManagerService } from '../../services/nanonym-manager.service';
import { UtilService } from '../../services/util.service';
import { WorkAccountStatus, WorkPoolService } from '../../services/work-pool.service';

@Component({
  standalone: false,
  selector: 'app-accounts',
  templateUrl: './accounts.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./accounts.component.css']
})
export class AccountsComponent implements OnInit, OnDestroy, AfterViewInit {
  private walletService = inject(WalletService);
  private notificationService = inject(NotificationService);
  modal = inject(ModalService);
  settings = inject(AppSettingsService);
  private representatives = inject(RepresentativeService);
  private router = inject(Router);
  private ledger = inject(LedgerService);
  private translocoService = inject(TranslocoService);
  private nanoNymStorage = inject(NanoNymStorageService);
  private nanoNymManager = inject(NanoNymManagerService);
  private util = inject(UtilService);
  private workPool = inject(WorkPoolService);

  readonly testIds = TestIds;
  readonly featureNanonyms = FEATURE_NANONYMS;
  readonly walletState$ = this.walletService.walletState$;
  accounts = this.walletService.walletState.accounts as any;
  isLedgerWallet = this.walletService.isLedgerWallet();
  isSingleKeyWallet = this.walletService.isSingleKeyWallet();
  viewAdvanced = false;
  newAccountIndex = null;

  // When we change the accounts, redetect changable reps (Debounce by 5 seconds)
  accountsChanged$ = new Subject();
  reloadRepWarning$ = this.accountsChanged$.pipe(debounce(() => timer(5000)));

  // Spendable accounts (unified view of regular + NanoNym accounts)
  spendableAccounts: SpendableAccount[] = [];
  regularAccounts: RegularAccount[] = [];
  nanoNymAccounts: NanoNymAccount[] = [];
  spendableAccountsSub: Subscription | null = null;
  workStatusByAccount = new Map<string, WorkAccountStatus>();
  workStatusSub: Subscription | null = null;

  // Generate NanoNym Modal
  @ViewChild('generateNanoNymModal') generateNanoNymModalRef!: ElementRef;
  generateNanoNymModal: any = null;
  newNanoNymLabel = '';
  generatingNanoNym = false;

  async ngOnInit() {
    this.reloadRepWarning$.subscribe(a => {
      this.representatives.detectChangeableReps();
    });
    this.sortAccounts();

    // Subscribe to spendable accounts (regular + NanoNyms)
    // Auto-updates when balances change
    this.spendableAccountsSub = this.walletService.spendableAccounts$.subscribe(
      (accounts) => {
        this.spendableAccounts = accounts;
        // Split into regular and NanoNym for grouped display
        this.regularAccounts = accounts.filter(a => a.type === 'regular') as RegularAccount[];
        this.nanoNymAccounts = accounts.filter(a => a.type === 'nanonym') as NanoNymAccount[];
      }
    );
    this.workStatusSub = this.workPool.accountStatus$.subscribe(statuses => {
      this.workStatusByAccount = new Map(statuses);
    });
  }

  ngOnDestroy() {
    if (this.spendableAccountsSub) {
      this.spendableAccountsSub.unsubscribe();
    }
    if (this.workStatusSub) {
      this.workStatusSub.unsubscribe();
    }
  }

  ngAfterViewInit() {
    const UIkit = window['UIkit'];

    // Initialize Generate NanoNym modal
    if (this.generateNanoNymModalRef) {
      this.generateNanoNymModal = UIkit.modal(this.generateNanoNymModalRef.nativeElement);
    }
  }

  getAccountLabel(account: RegularAccount): string {
    return account.label;
  }

  retryWork(account: string): void {
    this.workPool.retryAccountWork(account);
  }

  async createAccount() {
    if (this.walletService.isLocked()) {
      const wasUnlocked = await this.walletService.requestWalletUnlock();

      if (wasUnlocked === false) {
        return;
      }
    }

    if ((this.isLedgerWallet) && (this.ledger.ledger.status !== LedgerStatus.READY)) {
      return this.notificationService.sendWarning(this.translocoService.translate('accounts.ledger-device-must-be-ready'));
    }
    if (!this.walletService.isConfigured()) return this.notificationService.sendError(this.translocoService.translate('accounts.wallet-is-not-configured'));
    if (this.walletService.walletState.accounts.length >= 20) return this.notificationService.sendWarning(this.translocoService.translate('accounts.you-can-only-track-up-to-x-accounts-at-a-time', { accounts: 20 }));
    // Advanced view, manual account index?
    let accountIndex = null;
    if (this.viewAdvanced && this.newAccountIndex != null) {
      const index = parseInt(this.newAccountIndex, 10);
      if (index < 0) return this.notificationService.sendWarning(this.translocoService.translate('accounts.invalid-account-index-must-be-positive-number'));
      if (index > this.util.account.ACCOUNT_INDEX_MAX) {
        return this.notificationService.sendWarning(
          `Account index must be between 0 and ${this.util.account.ACCOUNT_INDEX_MAX}`
        );
      }
      const existingAccount = this.walletService.walletState.accounts.find(a => a.index === index);
      if (existingAccount) {
        return this.notificationService.sendWarning(
          this.translocoService.translate('accounts.the-account-at-this-index-is-already-loaded')
        );
      }
      accountIndex = index;
    }
    try {
      const newAccount = await this.walletService.addWalletAccount(accountIndex);
      this.notificationService.sendSuccess(
        this.translocoService.translate('accounts.successfully-created-new-account', { account: newAccount.id })
      );
      this.newAccountIndex = null;
      this.accountsChanged$.next(newAccount.id);
    } catch (err) {
      this.notificationService.sendError(this.translocoService.translate('accounts.unable-to-add-new-account', { error: err.message }));
    }
  }

  sortAccounts() {
    // if (this.walletService.isLocked()) return this.notificationService.sendError(`Wallet is locked.`);
    // if (!this.walletService.isConfigured()) return this.notificationService.sendError(`Wallet is not configured`);
    // if (this.walletService.wallet.accounts.length <= 1) {
      // return this.notificationService.sendWarning(`You need at least 2 accounts to sort them`);
    // }
    if (this.walletService.isLocked() || !this.walletService.isConfigured() ||
      this.walletService.walletState.accounts.length <= 1) return;
    this.walletService.sortAccountsByIndex();
    // this.accounts = this.walletService.wallet.accounts;
    this.walletService.saveWalletExport(); // Save new sorted accounts list
    // this.notificationService.sendSuccess(`Successfully sorted accounts by index!`);
  }

  navigateToAccount(account) {
    const isSmallViewport = (window.innerWidth < 940);

    if (isSmallViewport === true) {
        this.walletService.selectAccount(account ? account.id : null);
        this.walletService.saveWalletExport();
    }

    this.router.navigate([`account/${account.id}`], { queryParams: {'compact': 1} });
  }

  navigateToNanoNym(account: any) {
    const isSmallViewport = (window.innerWidth < 940);

    if (isSmallViewport) {
      // NanoNyms have an independent projection; clear regular-wallet
      // selection rather than storing a NanoNym ID in regular state.
      this.walletService.selectAccount(null);
      this.walletService.saveWalletExport();
    }

    this.router.navigate([`/account/${account.id}`], {
      queryParams: { compact: '1' }
    });
  }

  copied() {
    this.notificationService.removeNotification('success-copied');
    this.notificationService.sendSuccess(this.translocoService.translate('general.successfully-copied-to-clipboard'), { identifier: 'success-copied' });
  }

  async deleteAccount(account) {
    if (this.walletService.isLocked()) {
      const wasUnlocked = await this.walletService.requestWalletUnlock();

      if (wasUnlocked === false) {
        return;
      }
    }

    try {
      await this.walletService.removeWalletAccount(account.id);
      this.notificationService.sendSuccess(
        this.translocoService.translate('accounts.successfully-removed-account', { account: account.id })
      );
      this.accountsChanged$.next(account.id);
    } catch (err) {
      this.notificationService.sendError(this.translocoService.translate('accounts.unable-to-delete-account', { error: err.message }));
    }
  }

  async showLedgerAddress(account) {
    if (this.ledger.ledger.status !== LedgerStatus.READY) {
      return this.notificationService.sendWarning(this.translocoService.translate('accounts.ledger-device-must-be-ready'));
    }
    this.notificationService.sendInfo(this.translocoService.translate('accounts.confirming-account-address-on-ledger-device'), { identifier: 'ledger-account', length: 0 });
    try {
      await this.ledger.getLedgerAccount(account.index, true);
      this.notificationService.sendSuccess(this.translocoService.translate('accounts.account-address-confirmed-on-ledger'));
    } catch (err) {
      this.notificationService.sendError(this.translocoService.translate('accounts.account-address-denied-if-it-is-wrong-do-not-use-the-wallet'));
    }
    this.notificationService.removeNotification('ledger-account');
  }

  // Generate NanoNym Modal Methods
  async initiateGenerateNanoNymModal() {
    // Ensure wallet is unlocked BEFORE showing the modal
    if (this.walletService.isLocked()) {
      const wasUnlocked = await this.walletService.requestWalletUnlock();
      if (wasUnlocked === false) {
        return;
      }
    }

    // Only show the modal after successful unlock
    this.openGenerateNanoNymModal();
  }

  openGenerateNanoNymModal() {
    this.newNanoNymLabel = '';
    this.generatingNanoNym = false;
    if (this.generateNanoNymModal) {
      this.generateNanoNymModal.show();
    }
  }

  closeGenerateNanoNymModal() {
    this.newNanoNymLabel = '';
    this.generatingNanoNym = false;
    if (this.generateNanoNymModal) {
      this.generateNanoNymModal.hide();
    }
  }

  async generateNanoNym() {
    if (this.generatingNanoNym) return;

    this.generatingNanoNym = true;

    try {
      const label = this.newNanoNymLabel.trim() || undefined;
      const nanoNym = await this.nanoNymManager.createNanoNym(label);

      this.notificationService.sendSuccess(`NanoNym created: ${nanoNym.label}`);
      this.closeGenerateNanoNymModal();

      // Note: The spendableAccounts$ subscription will auto-update
      // when storage emits changes, so the new NanoNym will appear
      // in the table automatically
    } catch (error) {
      this.notificationService.sendError(
        `Failed to create NanoNym: ${(error as Error).message}`
      );
    } finally {
      this.generatingNanoNym = false;
    }
  }

}
