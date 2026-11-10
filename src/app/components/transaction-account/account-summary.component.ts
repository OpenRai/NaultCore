import { Component, Input, inject } from '@angular/core';
import { AppSettingsService } from '../../services/app-settings.service';
import { SpendableAccount } from '../../types/spendable-account.types';
import { formatNanoAmount } from '../../utils/nano-amount-format';
import { NanoIdenticonComponent } from '../helpers/nano-identicon/nano-identicon.component';

@Component({
  selector: 'app-account-summary',
  imports: [NanoIdenticonComponent],
  template: `
    @if (account) {
      <span class="identity">
        @if (account.type === 'regular' && settings.settings.identiconsStyle !== 'none') {
          <app-nano-identicon [accountID]="account.id" [scale]="4"
            [settingIdenticonsStyle]="settings.settings.identiconsStyle" aria-hidden="true" />
        }
        <span class="details">
          <span class="uk-text-bold">{{ account.label }}</span>
          @if (account.label !== indexLabel) {
            <span class="uk-text-small uk-text-muted"> · {{ indexLabel }}</span>
          }
          @if (showAddress) {
            <span class="address nano-address-monospace uk-text-small">{{ account.id }}</span>
          }
          <span class="available uk-text-small">Available: {{ amount(account.balance) }}</span>
          @if (account.pending?.gt(0)) {
            <span class="pending uk-text-small uk-text-muted">Pending: {{ amount(account.pending) }} (not yet available)</span>
          }
        </span>
      </span>
    }
  `,
  styles: [`
    :host { display: block; min-width: 0; }
    .identity { display: flex; align-items: flex-start; gap: 1rem; }
    .details { min-width: 0; }
    .address, .available, .pending { display: block; }
    .address { overflow-wrap: anywhere; margin-block: .25rem; }
    app-nano-identicon { flex: none; }
  `],
})
export class AccountSummaryComponent {
  @Input({ required: true }) account: SpendableAccount | null = null;
  @Input() showAddress = true;
  readonly settings = inject(AppSettingsService);
  get indexLabel(): string {
    return `${this.account?.type === 'regular' ? 'Account' : 'NanoNym'} #${this.account?.index}`;
  }
  amount(raw: unknown): string { return formatNanoAmount(raw, 'preview').display; }
}
