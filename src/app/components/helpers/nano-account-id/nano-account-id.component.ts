import {Component, Input, OnChanges, HostBinding, ChangeDetectionStrategy} from '@angular/core';

@Component({
  standalone: false,
  selector: 'app-nano-account-id',
  templateUrl: './nano-account-id.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./nano-account-id.component.css'],
})
export class NanoAccountIdComponent implements OnChanges {

  @HostBinding('class') classes: string;
  @Input() accountID: string;
  @Input() middle: 'on'|'off'|'auto'|'break' = 'auto';

  firstCharacters = '';
  middleCharacters = '';
  lastCharacters = '';
  isNanoNymAddress = false;

  constructor() { }

  ngOnChanges() {
    if (this.middle === 'auto') this.classes = 'uk-flex';
    if (this.middle === 'break') this.classes = 'nano-address-breakable';
    const accountID = this.accountID;

    // Detect NanoNym address
    this.isNanoNymAddress = FEATURE_NANONYMS && (accountID?.startsWith('nnym_') || false);

    const prefix = this.isNanoNymAddress ? 'nnym_' : 'nano_';
    const openingChars = 10;
    const closingChars = 5;
    this.firstCharacters = accountID?.split('').slice(0, openingChars).join('').replace(prefix, '');
    this.lastCharacters = accountID?.split('').slice(-closingChars).join('');
    if (this.middle !== 'off') {
      this.middleCharacters = accountID?.split('').slice(openingChars, -closingChars).join('');
    } else {
      this.middleCharacters = '';
    }
  }

}
