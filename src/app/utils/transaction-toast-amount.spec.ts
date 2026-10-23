import { formatNotificationAmount } from './transaction-toast-amount';

describe('formatNotificationAmount', () => {
  it('uses the configured minimum for bounded notifications', () => {
    expect(formatNotificationAmount('999999999999999999999999', '0.000001')).toBe('<0.000001 XNO');
  });

  it('keeps one raw visible when the minimum is zero or blank', () => {
    expect(formatNotificationAmount('1', '0')).toBe('Small amount (1 raw)');
    expect(formatNotificationAmount('1', null)).toBe('Small amount (1 raw)');
  });

  it('marks rounded notification amounts explicitly', () => {
    expect(formatNotificationAmount('1234567890123456789012345678901', null)).toBe('≈1.23457 XNO');
  });

  it('keeps zero and invalid values distinguishable', () => {
    expect(formatNotificationAmount('0', null)).toBe('0 XNO');
    expect(formatNotificationAmount('invalid', null)).toBe('');
  });
});
