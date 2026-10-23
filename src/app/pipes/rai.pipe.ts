import { Pipe, PipeTransform } from '@angular/core';
import { formatNanoAmount } from '../utils/nano-amount-format';

@Pipe({
  standalone: false,
  name: 'rai'
})
export class RaiPipe implements PipeTransform {
  precision = 6;

  mrai = 1000000000000000000000000000000;
  krai = 1000000000000000000000000000;
  rai  = 1000000000000000000000000;

  transform(value: any, args?: any): any {
    // Handle null/undefined gracefully
    if (value == null) {
      return '';
    }

    const opts = args.split(',');
    const denomination = opts[0] || 'mrai';
    const hideText = opts[1] || false;

    switch (denomination.toLowerCase()) {
      default:
      case 'xrb':
      case 'mnano':
        const exactXno = formatNanoAmount(value, 'inspect').exactXno;
        if (exactXno === null) return '';
        return `${exactXno}${!hideText ? '\u00A0XNO' : ''}`;
      case 'knano': return `${(value / this.krai).toFixed(3)}${!hideText ? '\u00A0knano' : ''}`;
      case 'nano': return `${(value / this.rai).toFixed(0)}${!hideText ? '\u00A0nano' : ''}`;
      case 'raw': return `${value}${!hideText ? '\u00A0raw' : ''}`;
      case 'dynamic':
        const rai = (value / this.rai);
        if (rai >= 1000000) {
          const mRaiValue = value / this.mrai;
          return `${mRaiValue.toFixed(this.precision)}${!hideText ? '\u00A0mRai' : ''}`;
        } else if (rai >= 1000) {
          return `${(value / this.krai).toFixed(this.precision)}${!hideText ? '\u00A0kRai' : ''}`;
        } else if (rai >= 0.00001) {
          return `${(value / this.rai).toFixed(this.precision)}${!hideText ? '\u00A0Rai' : ''}`;
        } else if (rai === 0) {
          return `${value}${!hideText ? '\u00A0mRai' : ''}`;
        } else {
          return `${value}${!hideText ? '\u00A0raw' : ''}`;
        }
    }
  }

  toFixed(num, fixed) {
    if (isNaN(num)) {
      return 0;
    }
    const re = new RegExp('^-?\\d+(?:\.\\d{0,' + (fixed || -1) + '})?');
    return num.toString().match(re)[0];
  }

}
