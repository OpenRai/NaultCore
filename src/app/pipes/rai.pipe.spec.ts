import { RaiPipe } from './rai.pipe';

describe('RaiPipe', () => {
  const pipe = new RaiPipe();

  it('preserves exact XNO precision for legacy mnano and xrb callers', () => {
    const raw = '1234567890123456789012345678901';
    expect(pipe.transform(raw, 'mnano')).toBe('1.234567890123456789012345678901\u00A0XNO');
    expect(pipe.transform(raw, 'mnano,true')).toBe('1.234567890123456789012345678901');
    expect(pipe.transform(raw, 'xrb')).toBe('1.234567890123456789012345678901\u00A0XNO');
  });

  it('does not collapse a one-raw amount to zero or a fixed threshold', () => {
    expect(pipe.transform('1', 'mnano')).toBe(`0.${'0'.repeat(29)}1\u00A0XNO`);
  });

  it('formats large values without floating point loss', () => {
    expect(pipe.transform('1000000000000000000000000000000000', 'mnano')).toBe('1000\u00A0XNO');
  });

  it('retains raw denomination behavior', () => {
    expect(pipe.transform('1', 'raw')).toBe('1\u00A0raw');
  });

  it('handles null and undefined inputs gracefully', () => {
    expect(pipe.transform(null, 'mnano')).toBe('');
    expect(pipe.transform(undefined, 'mnano')).toBe('');
  });
});
