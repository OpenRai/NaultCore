import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveNanoNymKeys,
  derivePublicKeyFromScalar,
  deriveStealthAddress,
  deriveStealthPrivateKey,
  generateEphemeralKey,
  generateSharedSecret,
  normalizeSeed,
} from "../dist/index.js";

const HEX_SEED = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const MNEMONIC = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

function hex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

test("normalizes hex seeds and BIP-39 mnemonics deterministically", () => {
  assert.equal(hex(normalizeSeed(HEX_SEED)), HEX_SEED);
  assert.equal(hex(normalizeSeed(MNEMONIC)), hex(normalizeSeed(MNEMONIC)));
  assert.equal(normalizeSeed(MNEMONIC).length, 64);
});

test("derives stable NanoNym keys for repeated seed and index inputs", () => {
  const first = deriveNanoNymKeys(HEX_SEED, 7);
  const second = deriveNanoNymKeys(HEX_SEED, 7);
  const otherIndex = deriveNanoNymKeys(HEX_SEED, 8);

  assert.equal(hex(first.spend.publicKey), "fd88513cfc116dc645f5cd160104399180f9d3108db51e1583a7544ca08363af");
  assert.equal(hex(first.view.publicKey), "ee22ecb8fbc1dbc3aa18bf2e24c5754f7694b16e685c36269fd6aa38648f57ca");
  assert.equal(hex(first.nostr.publicKey), "65672ef38a73afa5cfd28c1199a051d9579d200f6364e98e11ec31c1025b5fd3");
  assert.equal(hex(first.spend.publicKey), hex(second.spend.publicKey));
  assert.equal(hex(first.view.publicKey), hex(second.view.publicKey));
  assert.equal(hex(first.nostr.publicKey), hex(second.nostr.publicKey));
  assert.notEqual(hex(first.spend.publicKey), hex(otherIndex.spend.publicKey));
});

test("derives stable NanoNym keys from a mnemonic", () => {
  const first = deriveNanoNymKeys(MNEMONIC, 0);
  const second = deriveNanoNymKeys(MNEMONIC, 0);

  assert.equal(hex(first.spend.publicKey), "63dd0c7b3e438de763ba6664b6339ddd6daa8c15a5b5d5f70e33e172bc1db59f");
  assert.equal(hex(first.view.publicKey), "af8d8ec9367affc1411daf0fc39f8687e17d0f9cc3dbc36e00c68bdd72c9191a");
  assert.equal(hex(first.nostr.publicKey), "0790f51ad25babb7e354ebcd3fac94753bd200227feec4c2b8ba3e9408aec5a7");
  assert.equal(hex(first.spend.publicKey), hex(second.spend.publicKey));
  assert.equal(hex(first.view.publicKey), hex(second.view.publicKey));
  assert.equal(hex(first.nostr.publicKey), hex(second.nostr.publicKey));
});

test("sender stealth derivation and recipient recovery agree", () => {
  const recipient = deriveNanoNymKeys(HEX_SEED, 3);
  const ephemeral = generateEphemeralKey();
  const senderSecret = generateSharedSecret(ephemeral.privateKey, recipient.view.publicKey);
  const receiverSecret = generateSharedSecret(recipient.view.privateKey, ephemeral.publicKey);
  const stealth = deriveStealthAddress(senderSecret, recipient.spend.publicKey);
  const stealthPrivate = deriveStealthPrivateKey(recipient.spend.privateKey, receiverSecret);

  assert.equal(hex(senderSecret), hex(receiverSecret));
  assert.equal(hex(derivePublicKeyFromScalar(stealthPrivate)), hex(stealth.publicKey));
  assert.match(stealth.address, /^nano_/);
});
