import { FiatPipe } from './fiat.pipe';

describe('FiatPipe', () => {
  const pipe = new FiatPipe('en-US');

  it('displays currency values without approximation markers', () => {
    expect(pipe.transform(12.5, 'USD')).toBe('$12.50');
    expect(pipe.transform(0.8464398959692617, 'USD')).toBe('$0.85');
  });

  it('rounds to the currency display precision', () => {
    expect(pipe.transform(0.001, 'USD')).toBe('$0.00');
    expect(pipe.transform(0.5, 'JPY')).toBe('¥1');
  });

  it('keeps the existing six-decimal BTC display precision', () => {
    expect(pipe.transform(1.25, 'BTC')).toBe('BTC 1.250000');
    expect(pipe.transform(0.0000001, 'BTC')).toBe('BTC 0.000000');
  });

  it('does not convert unavailable or invalid values to zero', () => {
    expect(pipe.transform(null, 'USD')).toBe('');
    expect(pipe.transform('invalid', 'USD')).toBe('');
  });
});
