import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-nanonym-status-balance-panel',
  standalone: true,
  styles: `
    .details-header { text-transform: uppercase; font-size: var(--text-xs); margin-bottom: 2px; }
    .balance-details { min-height: 85px; }
    .account-amounts-primary {
      display: flex;
      align-items: center;
      white-space: nowrap;
      margin-top: 8px;
      margin-bottom: 6px;
    }
    .account-amounts-primary-confirmed {
      line-height: 1;
      min-width: 0;
      white-space: normal;
      overflow-wrap: anywhere;
    }
    .account-amounts-primary-confirmed > .amount-currency-symbol {
      font-size: var(--text-base);
      margin-right: 3px;
    }
  `,
  template: `
    <div class="uk-card-header uk-form-horizontal uk-width-expand">
      <div uk-grid>
        <div class="nanonym-status-section uk-width-1-1@s uk-width-1-2@l">
          <div class="details-header">{{ statusTitle }}</div>
          <div class="status-display">
            <div class="status-badge" [class.status-active]="nanoNym.status === 'active'" [class.status-archived]="nanoNym.status === 'archived'">
              <span class="status-icon" [attr.uk-icon]="'icon: ' + (nanoNym.status === 'active' ? 'check' : 'ban') + '; ratio: 0.8;'"></span>
              <span class="status-text">
                {{ nanoNym.status === 'active' ? activeLabel : archivedLabel }}
              </span>
            </div>
            <button class="uk-button uk-button-small uk-button-default uk-margin-small-top" (click)="toggleStatus.emit()">
              {{ nanoNym.status === 'active' ? archiveActionLabel : reactivateActionLabel }}
            </button>
          </div>
        </div>
        <div class="balance-details uk-width-1-1@s uk-width-1-2@l">
          <div class="details-header">{{ balanceTitle }}</div>
          @if (!loading) {
            <div>
              <div class="account-amounts-primary">
                <div class="account-amounts-primary-confirmed">
                  <span class="amount-currency-symbol xno-symbol"></span>
                  <ng-content select="[nanonymBalance]"></ng-content>
                </div>
              </div>
            </div>
            <div class="account-amounts-converted text-half-muted">
              {{ balanceFiatText }}
            </div>
            <div class="payment-count-summary uk-margin-small-top uk-text-muted uk-text-small">
              <span uk-icon="icon: credit-card; ratio: 0.7;"></span>
              {{ nanoNym.paymentCount }} {{ nanoNym.paymentCount === 1 ? 'payment' : 'payments' }}
            </div>
          } @else {
            <div class="uk-margin-small-top">
              <div uk-spinner="ratio: 0.5;" style="vertical-align: 2px;"></div>
            </div>
          }
        </div>
      </div>
    </div>
  `,
})
export class NanonymStatusBalancePanelComponent {
  @Input() nanoNym: any;
  @Input() loading = false;
  @Input() balanceFiatText = '';
  @Input() statusTitle = '';
  @Input() activeLabel = '';
  @Input() archivedLabel = '';
  @Input() archiveActionLabel = '';
  @Input() reactivateActionLabel = '';
  @Input() balanceTitle = '';

  @Output() toggleStatus = new EventEmitter<void>();
}
