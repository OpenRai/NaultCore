import type { NanoNymAddress, NanoNymPaymentEvent } from "@nanonyms/protocol";
import type { DerivedStealthAddress, NanoNymKeys } from "@nanonyms/crypto";

export interface NanoNymIdentity {
  index: number;
  keys: NanoNymKeys;
}

export interface PreparedNanoNymPayment {
  recipient: NanoNymAddress;
  ephemeralPublicKey: Uint8Array;
  ephemeralPrivateKey: Uint8Array;
  stealth: DerivedStealthAddress;
  notification: NanoNymPaymentEvent;
}

export interface RecoveredStealthPayment {
  stealth: DerivedStealthAddress;
  privateKeyScalar: Uint8Array;
  notification: NanoNymPaymentEvent;
}

export interface StealthBalanceLike {
  address: string;
  balanceRaw: bigint;
}
