import {
  NANO_NYM_PAYMENT_EVENT_VERSION,
  NANO_NYM_PAYMENT_EVENT_PROTOCOL,
  encodeNanoNymAddress,
  decodeNanoNymAddress,
} from "@nanonyms/protocol";
import type { NanoNymAddress, NanoNymPaymentEvent } from "@nanonyms/protocol";
import {
  deriveNanoNymKeys,
  deriveStealthAddress,
  deriveStealthPrivateKey,
  generateEphemeralKey,
  generateSharedSecret,
} from "@nanonyms/crypto";
import type {
  NanoNymIdentity,
  PreparedNanoNymPayment,
  RecoveredStealthPayment,
  StealthBalanceLike,
} from "./types.js";

export type {
  NanoNymIdentity,
  PreparedNanoNymPayment,
  RecoveredStealthPayment,
  StealthBalanceLike,
} from "./types.js";

export function createNanoNymIdentity(
  seed: string | Uint8Array,
  index: number,
): NanoNymIdentity {
  const keys = deriveNanoNymKeys(seed, index);
  return { index, keys };
}

export function createNanoNymAddress(
  identity: NanoNymIdentity,
  notificationUri: string,
): string {
  return encodeNanoNymAddress({
    version: 0x02,
    spendPublicKey: identity.keys.spend.publicKey,
    viewPublicKey: identity.keys.view.publicKey,
    notificationUri,
  });
}

export function prepareNanoNymPayment(
  recipientAddress: string,
  txHash: string,
  amountRaw?: bigint,
  memo?: string,
): PreparedNanoNymPayment {
  const recipient = decodeNanoNymAddress(recipientAddress);
  const ephemeralKey = generateEphemeralKey();
  const sharedSecret = generateSharedSecret(ephemeralKey.privateKey, recipient.viewPublicKey);
  const stealth = deriveStealthAddress(sharedSecret, recipient.spendPublicKey);

  return {
    recipient,
    ephemeralPublicKey: ephemeralKey.publicKey,
    ephemeralPrivateKey: ephemeralKey.privateKey,
    stealth,
    notification: {
      version: NANO_NYM_PAYMENT_EVENT_VERSION as 2,
      protocol: NANO_NYM_PAYMENT_EVENT_PROTOCOL as "nanonym",
      R: toHex(ephemeralKey.publicKey),
      tx_hash: txHash,
      amount_raw: amountRaw === undefined ? undefined : amountRaw.toString(),
      memo,
    },
  };
}

export function recoverStealthPayment(
  recipientKeys: Pick<NanoNymIdentity["keys"], "spend" | "view">,
  notification: NanoNymPaymentEvent,
): RecoveredStealthPayment {
  const ephemeralPublicKey = fromHex(notification.R);
  const sharedSecret = generateSharedSecret(recipientKeys.view.privateKey, ephemeralPublicKey);
  const stealth = deriveStealthAddress(sharedSecret, recipientKeys.spend.publicKey);
  const privateKeyScalar = deriveStealthPrivateKey(recipientKeys.spend.privateKey, sharedSecret);

  return {
    stealth,
    privateKeyScalar,
    notification,
  };
}

export function selectStealthInputs(
  amountRaw: bigint,
  available: readonly StealthBalanceLike[],
): StealthBalanceLike[] {
  const funded = available.filter((account) => account.balanceRaw > 0n);
  const single = funded.find((account) => account.balanceRaw >= amountRaw);
  if (single) {
    return [single];
  }

  const sorted = [...funded].sort((left, right) =>
    left.balanceRaw > right.balanceRaw ? -1 : left.balanceRaw < right.balanceRaw ? 1 : 0,
  );

  const selected: StealthBalanceLike[] = [];
  let remaining = amountRaw;

  for (const account of sorted) {
    if (remaining <= 0n) {
      break;
    }
    selected.push(account);
    remaining -= account.balanceRaw;
  }

  return shuffle(selected);
}

export { decodeNanoNymAddress as decodeRecipient } from "@nanonyms/protocol";

function shuffle<T>(items: T[]): T[] {
  const output = [...items];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const offset = Math.floor(Math.random() * (index + 1));
    [output[index], output[offset]] = [output[offset], output[index]];
  }
  return output;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("").toLowerCase();
}

function fromHex(hex: string): Uint8Array {
  const output = new Uint8Array(hex.length / 2);
  for (let index = 0; index < output.length; index += 1) {
    output[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return output;
}
