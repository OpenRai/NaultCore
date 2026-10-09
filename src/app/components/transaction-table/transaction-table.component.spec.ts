import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';
import BigNumber from 'bignumber.js';
import { TranslocoService } from '@jsverse/transloco';
import { WalletTransaction } from '../../models/transaction.model';
import { TransactionTableComponent } from './transaction-table.component';

function makeTransaction(overrides: Partial<WalletTransaction> = {}): WalletTransaction {
  return {
    hash: 'hash_a',
    accountId: 'nano_local',
    accountLabel: 'Primary',
    direction: 'received',
    amount: new BigNumber('1000000000000000000000000'),
    counterparty: 'nano_remote',
    counterpartyLabel: null,
    timestamp: 1600000000,
    status: 'confirmed',
    height: null,
    ...overrides,
  };
}

describe('TransactionTableComponent', () => {
  let component: TransactionTableComponent;
  let fixture: ComponentFixture<TransactionTableComponent>;

  const details = (): HTMLDetailsElement =>
    fixture.nativeElement.querySelector('details.tx-filters');

  const byTestId = (id: string): HTMLElement | null =>
    fixture.nativeElement.querySelector(`[data-testid="${id}"]`);

  /**
   * The native toggle event is queued rather than fired inline, in browsers as
   * well as in jsdom. Tests that reproduce a user action deliver it the same
   * way the platform does, so the handler observes the state the action left.
   */
  const deliverToggle = (): void => {
    details().dispatchEvent(new Event('toggle'));
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      // Declared on the TestBed rather than in a second static NgModule:
      // TransactionTableComponent already belongs to WalletTestModule and a
      // component may only be declared by one NgModule at compile time (NG6007).
      declarations: [TransactionTableComponent],
      imports: [RouterModule.forRoot([])],
      providers: [
        {
          provide: TranslocoService,
          useValue: {
            translate: (key: string, params?: any) =>
              params?.time ? `${key}:${params.time}` : params ? `${key}:${JSON.stringify(params)}` : key,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TransactionTableComponent);
    component = fixture.componentInstance;
    component.transactions = [
      makeTransaction(),
      makeTransaction({
        hash: 'hash_b',
        direction: 'sent',
        amount: new BigNumber('500000000000000000000000'),
      }),
    ];
    fixture.detectChanges();
  });

  it('collapses the filters by default and keeps the summary and table visible', () => {
    expect(component.filtersExpanded).toBe(false);
    expect(details().open).toBe(false);

    expect(byTestId('transaction-table-result-count')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.tx-summary-totals')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.tx-table-grid')).toBeTruthy();
    expect(byTestId('transaction-table-search-input')).toBeTruthy();
  });

  it('opens the filters and reveals the search input when the toggle is activated', () => {
    byTestId('transaction-table-filter-toggle').click();
    deliverToggle();
    fixture.detectChanges();

    expect(details().open).toBe(true);
    expect(component.filtersExpanded).toBe(true);
    expect(byTestId('transaction-table-search-input')).toBeTruthy();
  });

  it('opens the filters automatically when a pre-set filter is active', () => {
    component.setFilter({ direction: 'sent' });
    fixture.detectChanges();

    expect(component.filtersExpanded).toBe(true);
    expect(details().open).toBe(true);
    expect(fixture.nativeElement.querySelector('.tx-filters-active')).toBeTruthy();
    expect(byTestId('transaction-table-clear-filters')).toBeTruthy();
  });

  it('collapses again once the only active filter is cleared', () => {
    component.setFilter({ direction: 'sent' });
    fixture.detectChanges();
    expect(details().open).toBe(true);

    // The real reset path is the Clear filters button inside the panel; its
    // template event also marks the OnPush view dirty, as `resetFilters()` run
    // from a host would not.
    byTestId('transaction-table-clear-filters').click();
    fixture.detectChanges();

    expect(component.filtersExpanded).toBe(false);
    expect(details().open).toBe(false);
  });

  it('re-opens instead of hiding a filter that is still active', () => {
    component.setFilter({ direction: 'sent' });
    fixture.detectChanges();

    // The reader tries to collapse; the toggle handler intentionally overrides
    // them, mirroring the native toggle the click would produce.
    details().open = false;
    deliverToggle();
    fixture.detectChanges();

    expect(component.filtersExpanded).toBe(true);
    expect(details().open).toBe(true);
  });
});