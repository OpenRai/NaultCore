import BigNumber from 'bignumber.js';

const RAW_TO_XNO_TOAST_THRESHOLD = new BigNumber(1_000_000);

/** Return an exact raw-unit label for amounts too small to display clearly as XNO. */
export function formatSmallRawAmountForToast(rawAmount: BigNumber): string | null {
  if (!rawAmount.isInteger() || rawAmount.isNegative() || rawAmount.gte(RAW_TO_XNO_TOAST_THRESHOLD)) {
    return null;
  }

  return `${rawAmount.toFixed(0)} raw`;
}
