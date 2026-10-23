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
      amount = new BigNumber(value);
    } catch {
      return '';
    }
    if (currencyCode === 'BTC') {
      if (!amount.isFinite()) return '';
      const minimumUnit = new BigNumber('0.000001');
      if (!amount.isZero() && amount.abs().lt(minimumUnit)) {
        return `≈<BTC ${minimumUnit.toFixed(6)}`;
      }
      return `≈BTC ${amount.toFixed(6)}`;
    }

    if (!amount.isFinite()) return '';
    let maximumFractionDigits = 2;
    try {
      maximumFractionDigits = new Intl.NumberFormat(locale, { style: 'currency', currency: currencyCode }).resolvedOptions().maximumFractionDigits;
    } catch {
      // CurrencyPipe below retains its established invalid-currency behavior.
    }
    const minimumUnit = new BigNumber(10).pow(-maximumFractionDigits);
    if (!amount.isZero() && amount.abs().lt(minimumUnit)) {
      const bound = super.transform(minimumUnit.toNumber(), currencyCode, 'symbol-narrow', digits, locale);
      return bound == null ? '' : `≈<${bound}`;
    }
    const formatted = super.transform(value, currencyCode, 'symbol-narrow', digits, locale);
    return formatted == null ? '' : `≈${formatted}`;
  }
}
