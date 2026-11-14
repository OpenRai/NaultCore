import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ClipboardModule } from 'ngx-clipboard';
import { NanoAccountIdComponent } from '../../helpers/nano-account-id/nano-account-id.component';
import { NanoIdenticonComponent } from '../../helpers/nano-identicon/nano-identicon.component';

@Component({
  selector: 'app-account-identity-panel',
  standalone: true,
  imports: [ClipboardModule, NanoAccountIdComponent, NanoIdenticonComponent],
  styles: `
    :host { display: block; min-width: 0; }
    .account-type-label.editing-name { margin-bottom: 6px; }
    .nano-address-actions { margin-top: 0; }
    .icon-qr-code {
      display: inline-block;
      width: 19px;
      height: 19px;
      background-color: currentcolor;
      -webkit-mask-image: url('/assets/img/qr-code.svg');
      mask-image: url('/assets/img/qr-code.svg');
    }
    @media (min-width: 640px) {
      :host-context(.has-work-status) .account-identity { padding-block-start: 1.75rem; }
    }
  `,
  template: `
    <div uk-grid>
      @if (iconStyle !== 'none') {
        <app-nano-identicon scale="12" [accountID]="accountID" [settingIdenticonsStyle]="iconStyle" class="nano-identicon"></app-nano-identicon>
      }
      <div class="account-identity uk-width-1-1 uk-width-expand@s">
        @if (typeLabel) {
          <div class="account-type-label" [class.editing-name]="editing">{{ typeLabel }}</div>
        }
        <div uk-grid>
          @if (editing) {
            <div class="uk-width-1-1">
              <div class="uk-margin">
                <div class="uk-inline uk-width-1-1">
                  <a class="uk-form-icon uk-form-icon-flip uk-text-success" (click)="save.emit()" uk-icon="icon: check" uk-tooltip [title]="saveLabel"></a>
                  <a class="uk-form-icon uk-form-icon-flip uk-text-danger" style="margin-right: 26px;" (click)="editingChange.emit(false)" uk-tooltip [title]="cancelLabel" uk-icon="icon: close"></a>
                  <input class="uk-input" (keyup.enter)="save.emit()" [value]="model" (input)="modelChange.emit($any($event.target).value)" [placeholder]="placeholder" type="text" style="padding-right: 60px;" maxlength="64">
                </div>
              </div>
            </div>
          } @else {
            <div class="uk-width-1-1">
              <div class="uk-width-1-1">
                <div uk-grid>
                  <h3 class="uk-width-auto uk-card-title uk-text-truncate" style="max-width: calc(100% - 35px);">{{ displayLabel }}</h3>
                  <div class="uk-width-auto" style="padding-left: 10px; margin-top: 3px;">
                    <a style="display: contents;"><span uk-icon="icon: pencil;" uk-tooltip (click)="editingChange.emit(true)" [title]="editLabel"></span></a>
                  </div>
                </div>
              </div>
            </div>
          }
          <div class="uk-width-1-1 uk-margin-small-top">
            <div uk-grid>
              <div class="nano-address-monospace uk-width-auto uk-text-small uk-text-truncate" style="max-width: calc(100% - 60px);">
                <app-nano-account-id [accountID]="accountID"></app-nano-account-id>
              </div>
              <div class="nano-address-actions uk-width-auto" style="margin-top: 0;">
                <ul class="uk-iconnav">
                  <li><a ngxClipboard [cbContent]="accountID" (cbOnSuccess)="onCopySuccess()" uk-icon="icon: copy" [title]="copyLabel" uk-tooltip></a></li>
                  <li><a (click)="showQr.emit()" [title]="showQrLabel" uk-tooltip class="icon-qr-code"></a></li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class AccountIdentityPanelComponent {
  @Input() accountID = '';
  @Input() displayLabel = '';
  @Input() typeLabel = '';
  @Input() iconStyle = 'none';
  @Input() editing = false;
  @Input() model = '';
  @Input() placeholder = '';
  @Input() saveLabel = '';
  @Input() cancelLabel = '';
  @Input() editLabel = '';
  @Input() copyLabel = '';
  @Input() showQrLabel = '';

  @Output() editingChange = new EventEmitter<boolean>();
  @Output() modelChange = new EventEmitter<string>();
  @Output() save = new EventEmitter<void>();
  @Output() copied = new EventEmitter<void>();
  @Output() showQr = new EventEmitter<void>();

  onCopySuccess(): void {
    this.copied.emit();
  }
}
