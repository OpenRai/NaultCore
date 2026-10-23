import { formatNanoAmount } from './nano-amount-format';

/** Keep transaction notifications short while sharing the app's configured threshold and rounding rules. */
export function formatNotificationAmount(
  rawAmount: unknown,
  minimumReceiveXno: string | null | undefined,
): string {
  const presentation = formatNanoAmount(rawAmount, 'notify', minimumReceiveXno);
  if (presentation.relation === 'small') {
    return `Small amount (${presentation.exactRaw} raw)`;
  }
  return presentation.display;
}
