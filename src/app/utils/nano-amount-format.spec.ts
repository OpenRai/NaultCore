import { formatNanoAmount } from './nano-amount-format';
import BigNumber from 'bignumber.js';

const ONE_XNO_RAW = '1000000000000000000000000000000';

describe('formatNanoAmount', () => {
  it('preserves the exact XNO decimal and raw value in authorization and inspection contexts', () => {
    const raw = '1';
    for (const context of ['authorize', 'inspect'] as const) {
      expect(formatNanoAmount(raw, context)).toEqual({
        context,
        relation: 'exact',
        display: '0.' + '0'.repeat(29) + '1 XNO',
        exactXno: '0.' + '0'.repeat(29) + '1',
        exactRaw: raw,
        negative: false,
      });
    }
  });

  it('uses the configured minimum for a truthful summary bound', () => {
    expect(formatNanoAmount('999999999999999999999999', 'review', '0.000001')).toMatchObject({
      relation: 'bounded',
      display: '<0.000001 XNO',
      exactRaw: '999999999999999999999999',
    });
    expect(formatNanoAmount('1000000000000000000000000', 'review', '0.000001')).toMatchObject({
      relation: 'exact',
      display: '0.000001 XNO',
    });
    expect(formatNanoAmount('1', 'review', '.000001')).toMatchObject({
      relation: 'bounded',
      display: '<0.000001 XNO',
    });
  });

  it('keeps zero distinct from unavailable and invalid values', () => {
    expect(formatNanoAmount('0', 'review')).toMatchObject({ relation: 'exact', display: '0 XNO' });
    expect(formatNanoAmount(null, 'review')).toMatchObject({ relation: 'unavailable', display: '' });
    expect(formatNanoAmount('not raw', 'review')).toMatchObject({ relation: 'invalid', display: '' });
  });

  it('uses a small-amount label at the one-raw minimum when a decimal cannot fit', () => {
    expect(formatNanoAmount('1', 'review', null)).toMatchObject({
      relation: 'small',
      display: 'Small amount',
      exactXno: '0.' + '0'.repeat(29) + '1',
    });
  });

  it('treats a zero minimum setting as one raw unit without changing the threshold boundary', () => {
    expect(formatNanoAmount('1', 'review', '0')).toMatchObject({
      relation: 'small',
      exactRaw: '1',
    });
    expect(formatNanoAmount('2', 'review', '0')).toMatchObject({
      relation: 'small',
      exactRaw: '2',
    });
  });

  it('rejects fractional BigNumber raw values rather than rounding them', () => {
    expect(formatNanoAmount(new BigNumber('1.5'), 'inspect')).toMatchObject({
      relation: 'invalid',
      exactRaw: null,
    });
  });

  it('marks rounded summary values and keeps exact values available', () => {
    expect(formatNanoAmount('1234567890123456789012345678901', 'review', null)).toMatchObject({
      relation: 'approximate',
      display: '≈1.23457 XNO',
      exactXno: '1.234567890123456789012345678901',
    });
  });

  it('rounds decimal carries without floating-point conversion', () => {
    expect(formatNanoAmount('9999995000000000000000000000000', 'review', null)).toMatchObject({
      relation: 'approximate',
      display: '≈10 XNO',
    });
  });

  it('formats large values without scientific notation', () => {
    expect(formatNanoAmount('1000000000000000000000000000000000', 'review', null)).toMatchObject({
      relation: 'exact',
      display: '1000 XNO',
    });
  });

  it('rejects unsafe JavaScript numbers so imprecise raw input is never legitimized', () => {
    expect(formatNanoAmount(Number(ONE_XNO_RAW), 'authorize')).toMatchObject({ relation: 'invalid' });
  });
});
