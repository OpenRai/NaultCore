import { ChangeDetectionStrategy, Component, Input, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';

@Component({
  selector: 'app-breadcrumb',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <nav [attr.aria-label]="translate.translate('navigation.breadcrumb')">
      <ol>
        <li>
          <a [routerLink]="accountsOrigin ? '/accounts' : '/wallet'">
            {{ translate.translate(accountsOrigin ? 'general.accounts' : 'navigation.dashboard') }}
          </a>
        </li>
        <li class="current">
          <span aria-hidden="true" class="separator">›</span>
          <span aria-current="page">{{ current }}</span>
        </li>
      </ol>
    </nav>
  `,
  styles: [`
    :host { display: block; margin-block-end: .75rem; font-family: 'Montserrat', Arial, Helvetica, sans-serif; font-size: var(--text-lg); line-height: 1.3; }
    ol { display: flex; align-items: baseline; gap: .5rem; list-style: none; margin: 0; padding: 0; }
    li { min-width: 0; }
    li:first-child { flex-shrink: 0; }
    a { display: inline-block; padding-block: .25rem; text-decoration: underline; }
    a:focus-visible { outline: 2px solid currentColor; outline-offset: 3px; }
    .current { display: flex; align-items: baseline; gap: .5rem; overflow-wrap: anywhere; }
    [aria-current] { min-width: 0; font-weight: 600; }
    .separator { flex-shrink: 0; }
  `],
})
export class BreadcrumbComponent {
  @Input({ required: true }) current = '';
  @Input() origin?: 'accounts' | 'dashboard';
  private readonly route = inject(ActivatedRoute);
  readonly translate = inject(TranslocoService);
  private readonly queryParams = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });

  get accountsOrigin(): boolean {
    return (this.origin ?? this.queryParams().get('origin')) === 'accounts';
  }
}
