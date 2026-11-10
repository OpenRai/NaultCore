import { formatNanoAmount, splitNanoAmount } from './nano-amount-format';
import BigNumber from 'bignumber.js';

const ONE_XNO_RAW = '1000000000000000000000000000000';

describe('formatNanoAmount', () => {
  it('shows numeric previews independent of the minimum receive setting', () => {
    expect(formatNanoAmount('1234567890123456789012345678901', 'preview', '10').display).toBe('≈1.23457 XNO');
    expect(formatNanoAmount('10000000000000000000000', 'preview', '1').display).toBe('<0.000001 XNO');
    expect(formatNanoAmount('1', 'preview', null).display).toBe('1 raw');
    expect(formatNanoAmount('1234567', 'preview', '0').display).toBe('<0.000001 XNO');
    expect(formatNanoAmount('0', 'preview').display).toBe('0 XNO');
    expect(formatNanoAmount(null, 'preview').relation).toBe('unavailable');
  });

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

describe('exact display parts selected by widgets', () => {
  it('splits at the rai boundary without losing any raw units', () => {
    expect(splitNanoAmount('1000000000000086118708102050', 'en-US')).toEqual({ xno: '0.001 XNO', rawRemainder: '+86,118,708,102,050 raw' });
    expect(splitNanoAmount('1000000000000000000000000')).toEqual({ xno: '0.000001 XNO', rawRemainder: null });
    expect(splitNanoAmount('1')).toEqual({ xno: '0 XNO', rawRemainder: '+1 raw' });
  });
  it('localizes grouping and decimals without converting raw integers to floats', () => {
    expect(splitNanoAmount('1000000000000086118708102050', 'de-DE')).toEqual({ xno: '0,001 XNO', rawRemainder: '+86.118.708.102.050 raw' });
    expect(splitNanoAmount('-86118708102050', 'en-US')).toEqual({ xno: '0 XNO', rawRemainder: '−86,118,708,102,050 raw' });
  });
  it('never uses scientific notation for valid summary amounts', () => {
    for (const raw of ['1', '999999', '1000000', '2152970000000000', '340282366920938463463374607431768211455']) {
      expect(formatNanoAmount(raw, 'preview').display).not.toMatch(/×|[⁰¹²³⁴⁵⁶⁷⁸⁹]|e[+-]\d/i);
    }
  });
});
