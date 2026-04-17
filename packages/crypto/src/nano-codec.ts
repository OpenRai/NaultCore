import { blake2b } from "blakejs";

const NANO_BASE32_ALPHABET = "13456789abcdefghijkmnopqrstuwxyz".split("");

export function publicKeyToNanoAddress(publicKey: Uint8Array, prefix = "nano"): string {
  const accountHex = bytesToHex(publicKey);
  const keyBytes = uint4ToUint8(hexToUint4(accountHex));
  const checksum = uint5ToString(uint4ToUint5(uint8ToUint4(blake2b(keyBytes, undefined, 5).reverse())));
  const account = uint5ToString(uint4ToUint5(hexToUint4(`0${accountHex}`)));
  return `${prefix}_${account}${checksum}`;
}

function hexToUint4(hexValue: string): Uint8Array {
  const uint4 = new Uint8Array(hexValue.length);
  for (let index = 0; index < hexValue.length; index += 1) {
    uint4[index] = Number.parseInt(hexValue.substring(index, index + 1), 16);
  }
  return uint4;
}

function uint4ToUint8(value: Uint8Array): Uint8Array {
  const output = new Uint8Array(value.length / 2);
  for (let index = 0; index < output.length; index += 1) {
    output[index] = value[index * 2] * 16 + value[index * 2 + 1];
  }
  return output;
}

function uint8ToUint4(value: Uint8Array): Uint8Array {
  const output = new Uint8Array(value.length * 2);
  for (let index = 0; index < value.length; index += 1) {
    output[index * 2] = Math.floor(value[index] / 16);
    output[index * 2 + 1] = value[index] % 16;
  }
  return output;
}

function uint4ToUint5(value: Uint8Array): Uint8Array {
  const length = (value.length / 5) * 4;
  const output = new Uint8Array(length);
  for (let index = 1; index <= length; index += 1) {
    const n = index - 1;
    const m = index % 4;
    const z = n + (index - m) / 4;
    const right = value[z] << m;
    const left = (length - index) % 4 === 0 ? value[z - 1] << 4 : value[z + 1] >> (4 - m);
    output[n] = (left + right) % 32;
  }
  return output;
}

function uint5ToString(value: Uint8Array): string {
  let output = "";
  for (const item of value) {
    output += NANO_BASE32_ALPHABET[item];
  }
  return output;
}

function bytesToHex(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}
