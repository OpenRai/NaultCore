import { ChangeDetectorRef, Component, inject, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { WalletService, ApiService, UtilService, LedgerService, LedgerStatus } from '../../services';

type Preview = { index: number; id: string; addressBookName: string; balance?: string; pending?: string };

@Component({
  selector: 'app-derive-accounts', standalone: false,
  templateUrl: './derive-accounts.component.html',
  styleUrls: ['./derive-accounts.component.css']
})
export class DeriveAccountsComponent implements OnInit, OnDestroy {
  wallet = inject(WalletService);
  private changeDetector = inject(ChangeDetectorRef);
  private api = inject(ApiService);
  private util = inject(UtilService);
  private ledger = inject(LedgerService);
  private router = inject(Router);
  private translate = inject(TranslocoService);
  readonly max = this.util.account.ACCOUNT_INDEX_MAX;
  start = 0;
  jump = '0';
  rows: Preview[] = [];
  selected = new Set<number>();
  added: string[] = [];
  busy = false;
  loading = false;
  balanceLoading = false;
  error = false;
  invalid = false;
  outcome = '';
  private request = 0;
  private identity = '';
  private lifecycle?: Subscription;
  get capacity() { return Math.max(0, 20 - this.wallet.walletState.accounts.length); }
  get remainingCapacity() { return Math.max(0, this.capacity - this.selected.size); }
  tracked(index: number) { return this.wallet.walletState.accounts.some(a => a.index === index); }
  accountLabel(row: Preview): string {
    const account = this.wallet.walletState.accounts.find(a => a.index === row.index);
    return account?.addressBookName || row.addressBookName || this.translate.translate('derive.account', { index: row.index });
  }
  ngOnInit() {
    this.lifecycle?.unsubscribe();
    this.identity = '';
    this.lifecycle = this.wallet.lifecycle$.subscribe(() => {
      this.changeDetector.markForCheck();
      if (this.wallet.isLocked()) {
        ++this.request;
        this.identity = '';
        this.rows = [];
        this.selected.clear();
        this.loading = false;
        this.balanceLoading = false;
        this.error = false;
        return;
      }
      if (!this.wallet.isConfigured() || this.wallet.isSingleKeyWallet()) {
        this.error = true;
        return;
      }
      if (!this.identity) {
        this.identity = this.wallet.derivationIdentity;
        void this.page(this.start);
      } else if (!this.validWallet()) {
        ++this.request;
      }
    });
  }
  ngOnDestroy() { ++this.request; this.lifecycle?.unsubscribe(); }
  validWallet() {
    if (this.identity === this.wallet.derivationIdentity) return true;
    this.selected.clear(); this.rows = []; this.error = true;
    return false;
  }
  async page(start: number) {
    if (this.busy || this.wallet.isLocked() || !this.validWallet()) return;
    const request = ++this.request;
    this.balanceLoading = false;
    this.start = start; this.jump = String(start); this.rows = []; this.loading = true; this.error = false;
    try {
      if (this.wallet.isLedgerWallet() && this.ledger.ledger.status !== LedgerStatus.READY) throw new Error('Ledger unavailable');
      const rows: Preview[] = [];
      for (let index = start; index <= Math.min(start + 4, this.max); index++) rows.push(await this.wallet.previewAccount(index));
      if (request !== this.request || !this.validWallet()) return;
      this.rows = rows; this.loading = false; this.balanceLoading = true;
      this.changeDetector.markForCheck();
      try {
        const response = await this.api.accountsBalances(rows.map(a => a.id));
        if (request !== this.request || !this.validWallet()) return;
        for (const row of rows) {
          const balance = response?.balances?.[row.id];
          if (balance && /^\d+$/.test(balance.balance) && /^\d+$/.test(balance.pending)) {
            row.balance = balance.balance; row.pending = balance.pending;
          }
        }
      } finally { if (request === this.request) this.balanceLoading = false; }
    } catch { if (request === this.request) this.error = !this.rows.length; }
    finally { if (request === this.request) this.loading = false; this.changeDetector.markForCheck(); }
  }
  go() {
    this.invalid = !/^\d+$/.test(String(this.jump)) || !Number.isSafeInteger(Number(this.jump)) || Number(this.jump) > this.max;
    if (!this.invalid) void this.page(Number(this.jump));
  }
  toggle(index: number) {
    if (this.busy || this.wallet.isLocked() || !this.validWallet()) return;
    if (this.selected.has(index)) this.selected.delete(index);
    else if (!this.tracked(index) && this.selected.size < this.capacity) this.selected.add(index);
  }
  async add() {
    if (this.busy || !this.selected.size || !this.validWallet()) return;
    this.busy = true; this.outcome = '';
    let added = 0;
    try {
      if (this.wallet.isLocked() && !await this.wallet.requestWalletUnlock()) return;
      for (const index of [...this.selected].sort((a, b) => a - b)) {
        if (!this.validWallet()) break;
        if (this.tracked(index)) { this.selected.delete(index); continue; }
        if (!this.capacity) break;
        try {
          const account = await this.wallet.addWalletAccount(index, false, this.identity);
          this.added.push(account.id); added++; this.selected.delete(index);
        } catch { break; }
      }
      this.outcome = `${added}:${this.selected.size}`;
      if (!this.selected.size && added && !this.error) await this.back();
    } finally { this.busy = false; }
  }
  back() { return this.router.navigate(['/accounts'], { state: { addedAccounts: this.added } }); }
}
