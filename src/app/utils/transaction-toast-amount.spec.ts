import BigNumber from 'bignumber.js';
import { formatSmallRawAmountForToast } from './transaction-toast-amount';

describe('formatSmallRawAmountForToast', () => {
  it('formats small integer amounts exactly in raw', () => {
    expect(formatSmallRawAmountForToast(new BigNumber('999999'))).toBe('999999 raw');
    expect(formatSmallRawAmountForToast(new BigNumber('1'))).toBe('1 raw');
    expect(formatSmallRawAmountForToast(new BigNumber('0'))).toBe('0 raw');
  });

  it('leaves the threshold and larger amounts to existing XNO formatting', () => {
    expect(formatSmallRawAmountForToast(new BigNumber('1000000'))).toBeNull();
    expect(formatSmallRawAmountForToast(new BigNumber('1000001'))).toBeNull();
  });

  it('does not format non-integer or negative values as raw transaction amounts', () => {
    expect(formatSmallRawAmountForToast(new BigNumber('1.5'))).toBeNull();
    expect(formatSmallRawAmountForToast(new BigNumber('-1'))).toBeNull();
  });
});
