export const NANO_NYM_PREFIX = "nnym_";
export const NANO_NYM_VERSION = 0x02;

export interface NanoNymAddress {
  version: typeof NANO_NYM_VERSION;
  spendPublicKey: Uint8Array;
  viewPublicKey: Uint8Array;
  notificationUri: string;
}

export const NANO_NYM_PAYMENT_EVENT_VERSION = 2;
export const NANO_NYM_PAYMENT_EVENT_PROTOCOL = "nanonym";

export interface NanoNymPaymentEvent {
  version: 2;
  protocol: "nanonym";
  R: string;
  tx_hash: string;
  amount_raw?: string;
  memo?: string;
}

export function validatePaymentEvent(event: unknown): event is NanoNymPaymentEvent {
  if (typeof event !== "object" || event === null) {
    return false;
  }

  const obj = event as Record<string, unknown>;

  if (obj.version !== NANO_NYM_PAYMENT_EVENT_VERSION) {
    return false;
  }

  if (obj.protocol !== NANO_NYM_PAYMENT_EVENT_PROTOCOL) {
    return false;
  }

  if (typeof obj.R !== "string" || !/^[0-9a-f]{64}$/.test(obj.R)) {
    return false;
  }

  if (typeof obj.tx_hash !== "string" || !/^[0-9a-f]{64}$/.test(obj.tx_hash)) {
    return false;
  }

  if (obj.amount_raw !== undefined) {
    if (typeof obj.amount_raw !== "string") {
      return false;
    }
    if (obj.amount_raw !== "0" && /^0\d/.test(obj.amount_raw)) {
      return false;
    }
    if (!/^\d+$/.test(obj.amount_raw)) {
      return false;
    }
  }

  if (obj.memo !== undefined && typeof obj.memo !== "string") {
    return false;
  }

  return true;
}

/**
 * @deprecated Use NanoNymPaymentEvent instead.
 */
export type NanoNymTier1Notification = NanoNymPaymentEvent;
