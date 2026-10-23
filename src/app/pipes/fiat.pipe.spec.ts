import { FiatPipe } from './fiat.pipe';

describe('FiatPipe', () => {
  const pipe = new FiatPipe('en-US');

  it('marks fiat conversions as estimates', () => {
    expect(pipe.transform(12.5, 'USD')).toBe('≈$12.50');
  });

  it('shows a currency precision bound instead of a misleading zero', () => {
    expect(pipe.transform(0.001, 'USD')).toBe('≈<$0.01');
    expect(pipe.transform(0.5, 'JPY')).toBe('≈<¥1');
  });

  it('keeps BTC estimates at six decimals and bounds smaller nonzero values', () => {
    expect(pipe.transform(1.25, 'BTC')).toBe('≈BTC 1.250000');
    expect(pipe.transform(0.0000001, 'BTC')).toBe('≈<BTC 0.000001');
  });

  it('does not convert unavailable or invalid values to zero', () => {
    expect(pipe.transform(null, 'USD')).toBe('');
    expect(pipe.transform('invalid', 'USD')).toBe('');
  });
});
