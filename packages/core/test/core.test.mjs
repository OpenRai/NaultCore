import assert from "node:assert/strict";
import test from "node:test";
import {
  createNanoNymAddress,
  createNanoNymIdentity,
  prepareNanoNymPayment,
  recoverStealthPayment,
  selectStealthInputs,
} from "../dist/index.js";

const HEX_SEED = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const TX_HASH = "c".repeat(64);

function hex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

test("creates a NanoNym identity and v2 address", () => {
  const identity = createNanoNymIdentity(HEX_SEED, 2);
  const address = createNanoNymAddress(identity, "nostr:npub1coretest");

  assert.equal(identity.index, 2);
  assert.match(address, /^nnym_/);
});

test("prepares and recovers a NanoNym stealth payment", () => {
  const identity = createNanoNymIdentity(HEX_SEED, 4);
  const address = createNanoNymAddress(identity, "nostr:npub1roundtrip");
  const prepared = prepareNanoNymPayment(address, TX_HASH, 123n, "roundtrip");
  const recovered = recoverStealthPayment(identity.keys, prepared.notification);

  assert.equal(prepared.notification.version, 2);
  assert.equal(prepared.notification.protocol, "nanonym");
  assert.equal(prepared.notification.tx_hash, TX_HASH);
  assert.equal(prepared.notification.amount_raw, "123");
  assert.equal(prepared.notification.memo, "roundtrip");
  assert.equal(hex(prepared.stealth.publicKey), hex(recovered.stealth.publicKey));
  assert.equal(prepared.stealth.address, recovered.stealth.address);
});

test("selects stealth inputs without selecting zero-balance accounts", () => {
  const accounts = [
    { id: "empty", balanceRaw: 0n },
    { id: "small", balanceRaw: 3n },
    { id: "large", balanceRaw: 10n },
  ];

  assert.deepEqual(selectStealthInputs(8n, accounts), [accounts[2]]);
  assert.deepEqual(
    selectStealthInputs(12n, accounts).map((account) => account.id).sort(),
    ["large", "small"],
  );
});
