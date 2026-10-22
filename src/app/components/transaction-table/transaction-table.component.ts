import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, inject } from '@angular/core';
import BigNumber from 'bignumber.js';
import { TranslocoService } from '@jsverse/transloco';
import { TestIds } from '../../testing/test-ids';
import { RaiPipe } from '../../pipes/rai.pipe';
import {
  EMPTY_TRANSACTION_FILTER,
  TransactionDirection,
  TransactionFilter,
  WalletTransaction,
  filterTransactions,
  isFilterActive,
} from '../../models/transaction.model';

/**
 * The one transaction table in the app.
 *
 * Used by the Wallet page (every account merged) and by an Account page (that
 * account's chain only). Filters live here rather than in the host so both
 * pages answer the same questions the same way.
 *
 * Layout follows the responsive-table standard: the table adapts to its own
 * width with container queries, keeps its header visible while scrolling, and
 * stacks into labelled cards when narrow. It never hides itself on small
 * screens - dropping the data would be worse than rearranging it.
 *
 * The filter controls sit in a disclosure that is collapsed by default, so any
 * page hosting this component (Wallet today, Account later) shows the
 * transaction list first without extra wiring.
 */
@Component({
  selector: 'app-transaction-table',
  standalone: false,
  templateUrl: './transaction-table.component.html',
  styleUrls: ['./transaction-table.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [RaiPipe],
})
export class TransactionTableComponent {
  private readonly translate = inject(TranslocoService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly testIds = TestIds;

  /** Every transaction available to this view, already merged and sorted. */
  @Input() transactions: ReadonlyArray<WalletTransaction> = [];

  /** Distinct local accounts, for the account filter. Hidden when there is only one. */
  @Input() accounts: ReadonlyArray<{ id: string; label: string }> = [];

  @Input() loading = false;

  filter: TransactionFilter = { ...EMPTY_TRANSACTION_FILTER };

  /** True when the reader has opened the filter disclosure themselves. */
  filtersOpen = false;

  private readonly amountPipe = new RaiPipe();

  get visible(): WalletTransaction[] {
    return filterTransactions(this.transactions, this.filter);
  }

  get filtered(): boolean {
    return isFilterActive(this.filter);
  }

  /**
   * Open while the reader asks for it and whenever a filter is active, so an
   * active filter - including one pre-set through {@link setFilter} - is never
   * hidden behind the collapsed toggle.
   */
  get filtersExpanded(): boolean {
    return this.filtersOpen || this.filtered;
  }

  get totalVisible(): number {
    return this.visible.length;
  }

  get totalAll(): number {
    return this.transactions.length;
  }

  get showAccountFilter(): boolean {
    return this.accounts.length > 1;
  }

  get totals() {
    const rows = this.visible;
    let incoming = new BigNumber(0);
    let outgoing = new BigNumber(0);
    for (const row of rows) {
      if (row.direction === 'received') incoming = incoming.plus(row.amount);
      else outgoing = outgoing.plus(row.amount);
    }
    return { incoming, outgoing };
  }

  onDirectionChange(value: string): void {
    this.filter = { ...this.filter, direction: value as TransactionFilter['direction'] };
  }

  onSearchChange(value: string): void {
    this.filter = { ...this.filter, search: value };
  }

  onAmountMinChange(value: string): void {
    this.filter = { ...this.filter, amountMin: value };
  }

  onAmountMaxChange(value: string): void {
    this.filter = { ...this.filter, amountMax: value };
  }

  onAccountChange(value: string): void {
    this.filter = { ...this.filter, accountId: value || null };
  }

  /**
   * Keeps `filtersOpen` in step with the native disclosure. When a filter is
   * active a collapse attempt is overridden on purpose rather than by accident:
   * the panel re-opens so the active filter is never hidden. The re-assert is
   * needed because Angular's `[open]` binding only writes on value changes - a
   * native collapse leaves the DOM closed while `filtersExpanded` stays true,
   * so the binding alone would never put it back.
   */
  onFiltersToggle(event: Event): void {
    const detail = event.target as HTMLDetailsElement;
    this.filtersOpen = detail.open;
    const expanded = this.filtersExpanded;
    if (detail.open !== expanded) {
      this.filtersOpen = expanded;
      detail.open = expanded;
    }
    this.cdr.markForCheck();
  }

  resetFilters(): void {
    this.filter = { ...EMPTY_TRANSACTION_FILTER };
  }

  /** Applies a pre-set filter, e.g. when arriving from a "view this account" link. */
  setFilter(patch: Partial<TransactionFilter>): void {
    this.filter = { ...this.filter, ...patch };
    this.cdr.markForCheck();
  }

  /**
   * Resolved here rather than through the pipe because most of these strings
   * feed property bindings, which would re-run the pipe on every change
   * detection pass for text that only changes when the language does.
   */
  private t(key: string, params?: Record<string, unknown>): string {
    return this.translate.translate(key, params);
  }

  get labels() {
    return {
      caption: this.t('transaction-table.caption'),
      status: this.t('transaction-table.status'),
      details: this.t('transaction-table.details'),
      amount: this.t('transaction-table.amount'),
      date: this.t('transaction-table.date'),
      direction: this.t('transaction-table.direction'),
      directionAll: this.t('transaction-table.direction-all'),
      allAccounts: this.t('transaction-table.all-accounts'),
      account: this.t('transaction-table.account'),
      amountMin: this.t('transaction-table.amount-min'),
      amountMax: this.t('transaction-table.amount-max'),
      searchPlaceholder: this.t('transaction-table.search-placeholder'),
      filtersToggle: this.t('transaction-table.filters-toggle'),
      filtersActive: this.t('transaction-table.filters-active'),
      loading: this.t('transaction-table.loading'),
      noActivity: this.t('transaction-table.no-activity'),
      noActivityDesc: this.t('transaction-table.no-activity-desc'),
      noMatches: this.t('transaction-table.no-matches'),
      noCounterparty: this.t('transaction-table.no-counterparty'),
      awaitingReceive: this.t('transaction-table.awaiting-receive'),
      sent: this.t('transaction-table.sent'),
      received: this.t('transaction-table.received'),
      pending: this.t('transaction-table.pending'),
    };
  }

  /**
   * Plurals resolved here rather than through a translation-file convention,
   * so the singular/plural choice is visible and testable.
   */
  showingOfLabel(): string {
    return this.translate.translate('transaction-table.showing-of', {
      shown: this.totalVisible,
      total: this.totalAll,
    });
  }

  entryCountLabel(): string {
    const count = this.totalAll;
    return this.translate.translate(
      count === 1 ? 'transaction-table.entry-count-singular' : 'transaction-table.entry-count-plural',
      { count },
    );
  }

  directionLabel(direction: TransactionDirection): string {
    return direction === 'received'
      ? this.translate.translate('transaction-table.received')
      : this.translate.translate('transaction-table.sent');
  }

  accountLabel(id: string): string {
    return this.accounts.find(a => a.id === id)?.label ?? id;
  }

  formatAmount(amount: BigNumber | string | number): string {
    return this.amountPipe.transform(amount, 'mnano,true');
  }

  formatDate(timestamp: number | null): string {
    if (timestamp === null) return this.translate.translate('transaction-table.awaiting-receive');
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (date.toDateString() === now.toDateString()) {
      return this.translate.translate('transaction-table.today-at', { time });
    }
    const day = date.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
    return this.translate.translate('transaction-table.date-at', { day, time });
  }

  trackByHash(_index: number, transaction: WalletTransaction): string {
    return `${transaction.accountId}:${transaction.sourceHash ?? transaction.hash}`;
  }

  viewTransitionName(transaction: WalletTransaction): string {
    const stableId = `${transaction.accountId}-${transaction.sourceHash ?? transaction.hash}`;
    return `wallet-activity-${stableId.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  }
}
