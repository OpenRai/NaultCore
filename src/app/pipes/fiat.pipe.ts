import { CurrencyPipe } from '@angular/common';
import { Pipe, PipeTransform } from '@angular/core';
import BigNumber from 'bignumber.js';

@Pipe({
  standalone: false,
  name: 'fiat'
})
export class FiatPipe extends CurrencyPipe implements PipeTransform {
  override transform(value: any, currencyCode?: string, display?: 'code' | 'symbol' | 'symbol-narrow' | string | boolean, digits?: string, locale?: string): any {
    if (currencyCode === '') return '';
    if (value == null || value === '') return '';

    let amount: BigNumber;
    try {
      amount = new BigNumber(String(value));
    } catch {
      return '';
    }
    if (currencyCode === 'BTC') {
      if (!amount.isFinite()) return '';
      return `BTC ${amount.toFixed(6)}`;
    }

    if (!amount.isFinite()) return '';
    return super.transform(value, currencyCode, 'symbol-narrow', digits, locale) ?? '';
  }
}
