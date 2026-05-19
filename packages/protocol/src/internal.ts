import { blake2b } from "blakejs";
import {
  NANO_NYM_PREFIX,
  NANO_NYM_VERSION,
} from "./types.js";
import type { NanoNymAddress } from "./types.js";

const NANO_BASE32_ALPHABET = "13456789abcdefghijkmnopqrstuwxyz";
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function encodeNanoBase32(data: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += NANO_BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += NANO_BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

export function decodeNanoBase32(encoded: string): Uint8Array {
  const lookup = new Map<string, number>();
  for (let index = 0; index < NANO_BASE32_ALPHABET.length; index += 1) {
    lookup.set(NANO_BASE32_ALPHABET[index], index);
  }

  let bits = 0;
  let value = 0;
  let offset = 0;
  const output = new Uint8Array(Math.ceil((encoded.length * 5) / 8));

  for (const rawChar of encoded) {
    const char = rawChar.toLowerCase();
    const decoded = lookup.get(char);
    if (decoded === undefined) {
      throw new Error(`Invalid Nano base32 character: ${char}`);
    }

    value = (value << 5) | decoded;
    bits += 5;

    if (bits >= 8) {
      output[offset] = (value >>> (bits - 8)) & 0xff;
      offset += 1;
      bits -= 8;
    }
  }

  return output.slice(0, offset);
}

export function computeChecksum(payload: Uint8Array): Uint8Array {
  return new Uint8Array(blake2b(payload, undefined, 5));
}

export function encodeNanoNymAddress(input: NanoNymAddress): string {
  return `${NANO_NYM_PREFIX}${encodeNanoBase32(encodePayload(input))}`;
}

export function decodeNanoNymAddress(address: string): NanoNymAddress {
  if (!address.startsWith(NANO_NYM_PREFIX)) {
    throw new Error(`Invalid NanoNym address: expected ${NANO_NYM_PREFIX} prefix`);
  }

  const payload = decodeNanoBase32(address.slice(NANO_NYM_PREFIX.length));
  if (payload.length < 69) {
    throw new Error(`Invalid NanoNym address: payload too short (${payload.length} bytes)`);
  }
  if (payload[0] !== NANO_NYM_VERSION) {
    throw new Error(`Unsupported NanoNym address version: ${payload[0]}`);
  }

  return decodePayload(payload);
}

export function isNanoNymAddress(address: string): boolean {
  try {
    decodeNanoNymAddress(address);
    return true;
  } catch {
    return false;
  }
}

export function createNostrNotificationUri(identifier: string): string {
  if (!identifier) {
    throw new Error("Nostr identifier is required");
  }
  return identifier.startsWith("nostr:") ? identifier : `nostr:${identifier}`;
}

export function isNostrNotificationUri(uri: string): boolean {
  return uri.slice(0, 6).toLowerCase() === "nostr:";
}

export function validateNotificationUri(uri: string): void {
  if (!uri.trim()) {
    throw new Error("notificationUri must not be empty");
  }

  const schemeSeparator = uri.indexOf(":");
  if (schemeSeparator <= 0) {
    throw new Error("notificationUri must include a URI scheme");
  }
}

function encodePayload(input: NanoNymAddress): Uint8Array {
  assertKeyLength(input.spendPublicKey, "spendPublicKey");
  assertKeyLength(input.viewPublicKey, "viewPublicKey");
  if (input.version !== NANO_NYM_VERSION) {
    throw new Error(`Unsupported NanoNym address version: ${input.version}`);
  }

  validateNotificationUri(input.notificationUri);
  const uriBytes = textEncoder.encode(input.notificationUri);
  if (uriBytes.length > 0xffff) {
    throw new Error(`notificationUri too long: ${uriBytes.length} bytes`);
  }

  const checksumOffset = 67 + uriBytes.length;
  const payload = new Uint8Array(checksumOffset + 5);

  payload[0] = NANO_NYM_VERSION;
  payload.set(input.spendPublicKey, 1);
  payload.set(input.viewPublicKey, 33);
  payload[65] = (uriBytes.length >>> 8) & 0xff;
  payload[66] = uriBytes.length & 0xff;
  payload.set(uriBytes, 67);
  payload.set(computeChecksum(payload.slice(0, checksumOffset)), checksumOffset);

  return payload;
}

function decodePayload(payload: Uint8Array): NanoNymAddress {
  const uriLength = (payload[65] << 8) | payload[66];
  const checksumOffset = 67 + uriLength;

  if (payload.length !== checksumOffset + 5) {
    throw new Error(
      `Invalid NanoNym payload length: expected ${checksumOffset + 5}, got ${payload.length}`,
    );
  }

  verifyChecksum(payload, checksumOffset);
  const notificationUri = textDecoder.decode(payload.slice(67, checksumOffset));
  validateNotificationUri(notificationUri);

  return {
    version: NANO_NYM_VERSION,
    spendPublicKey: payload.slice(1, 33),
    viewPublicKey: payload.slice(33, 65),
    notificationUri,
  };
}

function verifyChecksum(payload: Uint8Array, checksumOffset: number): void {
  const expected = computeChecksum(payload.slice(0, checksumOffset));
  const actual = payload.slice(checksumOffset, checksumOffset + 5);

  if (!equalBytes(expected, actual)) {
    throw new Error("Invalid NanoNym address checksum");
  }
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

function assertKeyLength(key: Uint8Array, label: string): void {
  if (key.length !== 32) {
    throw new Error(`${label} must be 32 bytes, got ${key.length}`);
  }
}
