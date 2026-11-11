import { Component, Input, inject } from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';
import { WalletService } from '../../services/wallet.service';

@Component({
  selector: 'app-wallet-unlock-link',
  imports: [TranslocoModule],
  template: `<button type="button" class="unlock-wallet-link" [disabled]="pending"
    [attr.data-testid]="testId" (click)="requestUnlock($event)">{{ labelKey | transloco }}</button>`,
  styles: [`
    .unlock-wallet-link { padding: 0; border: 0; color: inherit; background: transparent; font: inherit; text-transform: none; text-decoration: underline; cursor: pointer; }
    .unlock-wallet-link:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
    .unlock-wallet-link:disabled { cursor: wait; }
  `],
})
export class WalletUnlockLinkComponent {
  @Input() labelKey = 'wallet-unlock.action';
  @Input() testId: string | null = null;
  private wallet = inject(WalletService);
  pending = false;

  async requestUnlock(event: Event): Promise<void> {
    event.stopPropagation();
    if (this.pending || !this.wallet.isLocked()) return;
    this.pending = true;
    try {
      await this.wallet.requestWalletUnlock();
    } finally {
      this.pending = false;
    }
  }
}
