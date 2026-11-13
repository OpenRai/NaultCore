import { Component, Input } from '@angular/core';
@Component({ standalone: true, selector: 'app-recovery-disclosure', templateUrl: './recovery-disclosure.component.html', styleUrl: './recovery-disclosure.component.css' })
export class RecoveryDisclosureComponent {
  @Input() summary = '';
  @Input() guidance = '';
  @Input() mnemonic = false;
}
