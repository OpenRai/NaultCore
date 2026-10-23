export type NanoAmountContext = 'authorize' | 'inspect' | 'review' | 'notify';
export type NanoAmountRelation = 'exact' | 'approximate' | 'bounded' | 'small' | 'unavailable' | 'invalid';

export interface NanoAmountPresentation {
  context: NanoAmountContext;
  relation: NanoAmountRelation;
  /** User-facing amount text. Direction is kept separate for bounded values. */
  display: string;
  /** Exact XNO decimal, present only when the raw input is valid. */
  exactXno: string | null;
  /** Exact integer raw value, present only when the raw input is valid. */
  exactRaw: string | null;
  negative: boolean;
}

const RAW_PER_XNO = 30;
const SUMMARY_SIGNIFICANT_DIGITS = 6;
const SUMMARY_MAX_NUMERIC_CHARACTERS = 18;

function normalizeIntegerRaw(value: unknown): string | null {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) return null;
    value = String(value);
  }
  if (typeof value !== 'string' && !(value && typeof (value as { toFixed?: unknown; isInteger?: unknown }).toFixed === 'function')) return null;
  if (typeof value !== 'string' && typeof (value as { isInteger?: unknown }).isInteger === 'function' && !(value as { isInteger: () => boolean }).isInteger()) return null;
  const stringValue = typeof value === 'string'
    ? value.trim()
    : (value as { toFixed: (digits: number) => string }).toFixed(0);
  if (!/^-?\d+$/.test(stringValue)) return null;
  const negative = stringValue.startsWith('-');
  const digits = stringValue.replace(/^-?0*/, '') || '0';
  return negative && digits !== '0' ? `-${digits}` : digits;
}

function rawToXno(raw: string): string {
  const negative = raw.startsWith('-');
  const digits = negative ? raw.slice(1) : raw;
  const padded = digits.padStart(RAW_PER_XNO + 1, '0');
  const integer = padded.slice(0, -RAW_PER_XNO).replace(/^0+(?=\d)/, '');
  const fractional = padded.slice(-RAW_PER_XNO).replace(/0+$/, '');
  return `${negative ? '-' : ''}${integer}${fractional ? `.${fractional}` : ''}`;
}

function xnoToRaw(value: string | null | undefined): string | null {
  if (value == null || value.trim() === '') return '1';
  let normalized = value.trim();
  if (normalized.startsWith('.')) normalized = `0${normalized}`;
  if (!/^\d+(?:\.\d{0,30})?$/.test(normalized)) return null;
  const [integer, fraction = ''] = normalized.split('.');
  const raw = `${integer}${fraction.padEnd(RAW_PER_XNO, '0')}`.replace(/^0+(?=\d)/, '');
  return raw === '0' ? '1' : raw;
}

function roundToSignificantDigits(xno: string, significantDigits: number): string {
  const [integer, fraction = ''] = xno.split('.');
  const allDigits = `${integer}${fraction}`;
  const firstNonZero = allDigits.search(/[1-9]/);
  if (firstNonZero === -1) return '0';

  const significant = allDigits.slice(firstNonZero);
  const exponent = integer.length - firstNonZero - 1;
  let coefficient = significant.slice(0, significantDigits).padEnd(significantDigits, '0');
  if (significant.length > significantDigits && significant[significantDigits] >= '5') {
    coefficient = (BigInt(coefficient) + 1n).toString();
  }

  let adjustedExponent = exponent;
  if (coefficient.length > significantDigits) {
    coefficient = coefficient.slice(0, significantDigits);
    adjustedExponent += 1;
  }

  const decimalPosition = adjustedExponent + 1;
  let rounded: string;
  if (decimalPosition <= 0) {
    rounded = `0.${'0'.repeat(-decimalPosition)}${coefficient}`;
  } else if (decimalPosition >= coefficient.length) {
    rounded = `${coefficient}${'0'.repeat(decimalPosition - coefficient.length)}`;
  } else {
    rounded = `${coefficient.slice(0, decimalPosition)}.${coefficient.slice(decimalPosition)}`;
  }
  return rounded.includes('.') ? rounded.replace(/0+$/, '').replace(/\.$/, '') : rounded;
}

function unavailable(context: NanoAmountContext, relation: 'unavailable' | 'invalid'): NanoAmountPresentation {
  return { context, relation, display: '', exactXno: null, exactRaw: null, negative: false };
}

/**
 * Format exact Nano raw integers according to the user-facing context.
 * Authorization and inspection never round. Review and notification summaries
 * use six significant digits and the configured minimum-receivable boundary.
 */
export function formatNanoAmount(
  rawValue: unknown,
  context: NanoAmountContext,
  minimumReceiveXno: string | null | undefined = '0.000001',
  numericCharacterBudget = SUMMARY_MAX_NUMERIC_CHARACTERS,
): NanoAmountPresentation {
  if (rawValue == null) return unavailable(context, 'unavailable');
  const raw = normalizeIntegerRaw(rawValue);
  if (raw == null) return unavailable(context, 'invalid');

  const negative = raw.startsWith('-');
  const magnitude = negative ? raw.slice(1) : raw;
  const signedXno = rawToXno(raw);
  if (context === 'authorize' || context === 'inspect') {
    return { context, relation: 'exact', display: `${signedXno} XNO`, exactXno: signedXno, exactRaw: raw, negative };
  }

  if (magnitude === '0') {
    return { context, relation: 'exact', display: '0 XNO', exactXno: '0', exactRaw: '0', negative: false };
  }

  const minimumRaw = xnoToRaw(minimumReceiveXno);
  if (minimumRaw == null) return unavailable(context, 'invalid');
  const numericRaw = BigInt(magnitude);
  const minimum = BigInt(minimumRaw);
  if (numericRaw < minimum) {
    const boundXno = rawToXno(minimumRaw);
    const numericText = `<${boundXno}`;
    if (numericText.length > numericCharacterBudget) {
      return { context, relation: 'small', display: 'Small amount', exactXno: signedXno, exactRaw: raw, negative };
    }
    return { context, relation: 'bounded', display: `${numericText} XNO`, exactXno: signedXno, exactRaw: raw, negative };
  }

  const rounded = roundToSignificantDigits(rawToXno(magnitude), SUMMARY_SIGNIFICANT_DIGITS);
  if (rounded.length > numericCharacterBudget) {
    return { context, relation: 'small', display: 'Small amount', exactXno: signedXno, exactRaw: raw, negative };
  }
  const isExact = rounded === rawToXno(magnitude);
  return {
    context,
    relation: isExact ? 'exact' : 'approximate',
    display: `${negative ? '−' : ''}${isExact ? '' : '≈'}${rounded} XNO`,
    exactXno: signedXno,
    exactRaw: raw,
    negative,
  };
}

