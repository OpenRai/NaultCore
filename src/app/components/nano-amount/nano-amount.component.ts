import { ChangeDetectionStrategy, Component, Input, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { AppSettingsService } from '../../services/app-settings.service';
import { NotificationService } from '../../services/notification.service';
import { formatNanoAmount, NanoAmountContext, NanoAmountPresentation } from '../../utils/nano-amount-format';

@Component({
  selector: 'app-nano-amount',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './nano-amount.component.css',
  templateUrl: './nano-amount.component.html',
})
export class NanoAmountComponent {
  @Input() raw: unknown;
  @Input() context: NanoAmountContext = 'review';
  @Input() smallLabel: 'amount' | 'balance' = 'amount';
  @Input() showExactDetails = true;

  private readonly settings = inject(AppSettingsService);
  private readonly notifications = inject(NotificationService);
  private readonly translate = inject(TranslocoService);

  get presentation(): NanoAmountPresentation {
    return formatNanoAmount(this.raw, this.context, this.settings.settings.minimumReceive);
  }

  get smallText(): string {
    const key = this.smallLabel === 'balance' ? 'amount.small-balance' : 'amount.small-amount';
    return this.translate.translate(key);
  }

  copied(): void {
    this.notifications.removeNotification('success-copied');
    this.notifications.sendSuccess(this.translate.translate('general.successfully-copied-to-clipboard'), { identifier: 'success-copied' });
  }
}
