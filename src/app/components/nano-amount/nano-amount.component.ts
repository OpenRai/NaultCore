import { ChangeDetectionStrategy, Component, Input, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { formatNanoAmount, splitNanoAmount, NanoAmountPresentation } from '../../utils/nano-amount-format';

@Component({
  selector: 'app-nano-amount',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './nano-amount.component.css',
  templateUrl: './nano-amount.component.html',
})
export class NanoAmountComponent {
  @Input() raw: unknown;
  @Input() context: 'preview' | 'inspect' | 'authorize' = 'preview';
  @Input() precision: 'summary' | 'raw-detail' = 'summary';
  @Input() detailsRoute: string | null = null;

  private readonly translate = inject(TranslocoService);

  get unavailableLabel(): string {
    return this.translate.translate('amount.unavailable');
  }

  get detailsLabel(): string {
    return this.translate.translate('general.view-details');
  }

  get detailParts(): ReturnType<typeof splitNanoAmount> {
    return this.precision === 'raw-detail' ? splitNanoAmount(this.raw, this.translate.getActiveLang() || 'en') : null;
  }

  get presentation(): NanoAmountPresentation {
    return formatNanoAmount(this.raw, this.precision === 'summary' ? 'preview' : this.context, undefined, undefined, this.translate.getActiveLang() || 'en');
  }
}
