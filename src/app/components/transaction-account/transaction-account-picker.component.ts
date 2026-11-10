import { Component, ElementRef, EventEmitter, Input, Output, afterNextRender, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SpendableAccount } from '../../types/spendable-account.types';
import { AccountSummaryComponent } from './account-summary.component';

@Component({
  selector: 'app-transaction-account-picker',
  imports: [FormsModule, RouterLink, AccountSummaryComponent],
  template: `
    <section class="uk-card uk-card-default uk-margin" data-testid="transaction.accountPicker">
      <div class="uk-card-header">
        <h3 class="uk-card-title uk-margin-remove" #heading tabindex="-1">{{ title }}</h3>
      </div>
      <div class="uk-card-body">
        @if (message) { <p class="uk-text-warning" role="status">{{ message }}</p> }
        @if (accounts.length) {
          <label class="uk-form-label uk-display-block" [for]="searchId">Find an account</label>
          <input class="uk-input uk-margin-small-bottom" type="search" [id]="searchId"
            [(ngModel)]="search" placeholder="Name, account number or address" autocomplete="off"
            autocapitalize="none" autocorrect="off" spellcheck="false">
          <ul class="uk-list uk-list-divider uk-margin-remove-bottom">
            @for (account of filteredAccounts; track account.id) {
              <li>
                <button class="account-option uk-width-1-1 uk-text-left" type="button"
                  [attr.data-account-id]="account.id" [attr.aria-current]="account.id === selectedId ? 'true' : null"
                  (click)="accountSelected.emit(account.id)">
                  <app-account-summary [account]="account" />
                  @if (account.id === selectedId) { <span class="uk-text-primary uk-text-small">Selected</span> }
                </button>
              </li>
            } @empty { <li role="status">No matching accounts.</li> }
          </ul>
        } @else {
          <p>No accounts are available. Add an account to continue.</p>
          <a routerLink="/accounts" class="uk-button uk-button-primary">Manage accounts</a>
        }
      </div>
      @if (selectedId || canCancel) {
        <div class="uk-card-footer">
          <button class="uk-button uk-button-default" type="button" (click)="cancelled.emit()">Back</button>
        </div>
      }
    </section>
  `,
  styles: [`
    .account-option { display: block; background: transparent; color: inherit; border: 1px solid transparent; border-radius: 4px; padding: .75rem; font: inherit; cursor: pointer; }
    .account-option:hover, .account-option[aria-current] { border-color: currentColor; }
    .account-option:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
  `],
})
export class TransactionAccountPickerComponent {
  @Input() accounts: readonly SpendableAccount[] = [];
  @Input() selectedId = '';
  @Input() canCancel = false;
  @Input() excludeId = '';
  @Input() title = 'Choose an account';
  @Input() message = '';
  @Input() searchId = 'transaction-account-search';
  @Output() accountSelected = new EventEmitter<string>();
  @Output() cancelled = new EventEmitter<void>();
  private readonly heading = viewChild<ElementRef<HTMLHeadingElement>>('heading');
  search = '';

  constructor() { afterNextRender(() => this.heading()?.nativeElement.focus()); }

  get filteredAccounts(): readonly SpendableAccount[] {
    const query = this.search.trim().toLowerCase().replace(/^#/, '');
    return this.accounts.filter(account => account.id !== this.excludeId &&
      (!query || `${account.label} ${account.index} ${account.id}`.toLowerCase().includes(query)));
  }
}
