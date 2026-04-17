import * as bip39 from "bip39";
import { blake2b } from "blakejs";
import * as nacl from "tweetnacl";
import { ed25519 } from "@noble/curves/ed25519";
import { bytesToHex } from "@noble/curves/abstract/utils";
import { getPublicKey as getSecpPublicKey } from "@noble/secp256k1";
import { publicKeyToNanoAddress } from "./nano-codec";
import type {
  DerivedStealthAddress,
  EphemeralKeyPair,
  NanoNymKeys,
} from "./types";

const ED25519_L = BigInt(
  "0x1000000000000000000000000000000014def9dea2f79cd65812631a5cf5d3ed",
);

export type { DerivedStealthAddress, EphemeralKeyPair, NanoNymKeys } from "./types";

export function normalizeSeed(seed: string | Uint8Array): Uint8Array {
  if (seed instanceof Uint8Array) {
    return seed;
  }

  if (/^[0-9A-Fa-f]{64}$/.test(seed)) {
    return hexToUint8(seed);
  }

  return new Uint8Array(bip39.mnemonicToSeedSync(seed));
}

export function deriveNanoNymKeys(seed: string | Uint8Array, accountIndex: number): NanoNymKeys {
  const seedBytes = normalizeSeed(seed);
  const basePath = uint32ToBytes(44 | 0x80000000)
    .concat(uint32ToBytes(165 | 0x80000000))
    .concat(uint32ToBytes(0 | 0x80000000))
    .concat(uint32ToBytes(1000 | 0x80000000))
    .concat(uint32ToBytes(accountIndex | 0x80000000));

  const spendSeed = deriveChildKey(seedBytes, basePath.concat(uint32ToBytes(0)));
  const viewSeed = deriveChildKey(seedBytes, basePath.concat(uint32ToBytes(1)));
  const nostrSeed = deriveChildKey(seedBytes, basePath.concat(uint32ToBytes(2)));
  const nostrPrivateKey = new Uint8Array(blake2b(nostrSeed, undefined, 32));

  return {
    spend: blake2bKeyPairFromSeed(spendSeed),
    view: blake2bKeyPairFromSeed(viewSeed),
    nostr: {
      privateKey: nostrPrivateKey,
      publicKey: getSecpPublicKey(nostrPrivateKey, true).slice(1),
    },
  };
}

export function generateSharedSecret(privateKey: Uint8Array, publicKey: Uint8Array): Uint8Array {
  const scalar = bytesToBigIntLE(blake2bToScalar(privateKey));
  const point = ed25519.ExtendedPoint.fromHex(bytesToHex(publicKey));
  return point.multiply(scalar).toRawBytes();
}

export function deriveStealthAddress(
  sharedSecret: Uint8Array,
  recipientSpendPublicKey: Uint8Array,
): DerivedStealthAddress {
  const tweakScalar = deriveTweakScalar(sharedSecret);
  const tweakPoint = ed25519.ExtendedPoint.BASE.multiply(bytesToBigIntLE(tweakScalar)).toRawBytes();
  const stealthPublicKey = ed25519PointAdd(recipientSpendPublicKey, tweakPoint);

  return {
    publicKey: stealthPublicKey,
    address: publicKeyToNanoAddress(stealthPublicKey),
  };
}

export function deriveStealthPrivateKey(spendPrivateKey: Uint8Array, sharedSecret: Uint8Array): Uint8Array {
  const tweakScalar = deriveTweakScalar(sharedSecret);
  const spendPrivateScalar = blake2bToScalar(spendPrivateKey);
  return ed25519ScalarAdd(spendPrivateScalar, tweakScalar);
}

export function generateEphemeralKey(): EphemeralKeyPair {
  return blake2bKeyPairFromSeed(nacl.randomBytes(32));
}

export function derivePublicKeyFromScalar(privateKeyScalar: Uint8Array): Uint8Array {
  return ed25519.ExtendedPoint.BASE.multiply(bytesToBigIntLE(privateKeyScalar)).toRawBytes();
}

export function signBlockWithScalar(privateKeyScalar: Uint8Array, messageHash: Uint8Array): Uint8Array {
  const publicKeyBytes = derivePublicKeyFromScalar(privateKeyScalar);

  const rInput = concatBytes(privateKeyScalar, messageHash);
  const r = hashToScalarModL(new Uint8Array(blake2b(rInput, undefined, 64)));
  const rBigInt = bytesToBigIntLE(r);
  const RBytes = ed25519.ExtendedPoint.BASE.multiply(rBigInt).toRawBytes();

  const kInput = concatBytes(RBytes, publicKeyBytes, messageHash);
  const k = hashToScalarModL(new Uint8Array(blake2b(kInput, undefined, 64)));
  const kBigInt = bytesToBigIntLE(k);

  const scalar = bytesToBigIntLE(privateKeyScalar);
  const s = (rBigInt + kBigInt * scalar) % ED25519_L;
  const sBytes = bigIntToBytesLE(s, 32);

  return concatBytes(RBytes, sBytes);
}

function deriveChildKey(parentSeed: Uint8Array, path: number[]): Uint8Array {
  return new Uint8Array(blake2b(concatBytes(parentSeed, new Uint8Array(path)), undefined, 32));
}

function blake2bKeyPairFromSeed(seed: Uint8Array) {
  const scalar = bytesToBigIntLE(blake2bToScalar(seed));
  return {
    privateKey: seed,
    publicKey: ed25519.ExtendedPoint.BASE.multiply(scalar).toRawBytes(),
  };
}

function deriveTweakScalar(sharedSecret: Uint8Array): Uint8Array {
  const accountIndex = new Uint8Array(4);
  const accountSeed = blake2b(concatBytes(sharedSecret, accountIndex), undefined, 32);
  return blake2bToScalar(new Uint8Array(accountSeed));
}

function blake2bToScalar(input: Uint8Array): Uint8Array {
  const hash64 = blake2b(input, undefined, 64);
  const clamped = new Uint8Array(hash64.slice(0, 32));
  clamped[0] &= 248;
  clamped[31] &= 127;
  clamped[31] |= 64;
  return bigIntToBytesLE(bytesToBigIntLE(clamped) % ED25519_L, 32);
}

function hashToScalarModL(hash64: Uint8Array): Uint8Array {
  return bigIntToBytesLE(bytesToBigIntLE(hash64) % ED25519_L, 32);
}

function ed25519PointAdd(point1: Uint8Array, point2: Uint8Array): Uint8Array {
  return ed25519.ExtendedPoint.fromHex(bytesToHex(point1))
    .add(ed25519.ExtendedPoint.fromHex(bytesToHex(point2)))
    .toRawBytes();
}

function ed25519ScalarAdd(left: Uint8Array, right: Uint8Array): Uint8Array {
  return bigIntToBytesLE((bytesToBigIntLE(left) + bytesToBigIntLE(right)) % ED25519_L, 32);
}

function bytesToBigIntLE(bytes: Uint8Array): bigint {
  let result = BigInt(0);
  for (let index = 0; index < bytes.length; index += 1) {
    result += BigInt(bytes[index]) << BigInt(index * 8);
  }
  return result;
}

function bigIntToBytesLE(value: bigint, length: number): Uint8Array {
  const output = new Uint8Array(length);
  let remainder = value;
  for (let index = 0; index < length; index += 1) {
    output[index] = Number(remainder & BigInt(0xff));
    remainder >>= BigInt(8);
  }
  return output;
}

function uint32ToBytes(value: number): number[] {
  return [
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ];
}

function hexToUint8(hex: string): Uint8Array {
  const output = new Uint8Array(hex.length / 2);
  for (let index = 0; index < output.length; index += 1) {
    output[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return output;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}
