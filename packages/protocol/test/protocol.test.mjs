import assert from "node:assert/strict";
import test from "node:test";
import {
  NANO_NYM_PAYMENT_EVENT_PROTOCOL,
  NANO_NYM_PAYMENT_EVENT_VERSION,
  NANO_NYM_VERSION,
  computeChecksum,
  decodeNanoNymAddress,
  encodeNanoNymAddress,
  isNanoNymAddress,
  validatePaymentEvent,
} from "../dist/index.js";

function bytes(value) {
  return new Uint8Array(32).fill(value);
}

test("encodes and decodes a v2 NanoNym address", () => {
  const input = {
    version: NANO_NYM_VERSION,
    spendPublicKey: bytes(1),
    viewPublicKey: bytes(2),
    notificationUri: "nostr:npub1nanonymtest",
  };

  const address = encodeNanoNymAddress(input);
  const decoded = decodeNanoNymAddress(address);

  assert.match(address, /^nnym_/);
  assert.equal(decoded.version, input.version);
  assert.deepEqual(decoded.spendPublicKey, input.spendPublicKey);
  assert.deepEqual(decoded.viewPublicKey, input.viewPublicKey);
  assert.equal(decoded.notificationUri, input.notificationUri);
  assert.equal(isNanoNymAddress(address), true);
});

test("rejects a NanoNym address with a broken checksum", () => {
  const address = encodeNanoNymAddress({
    version: NANO_NYM_VERSION,
    spendPublicKey: bytes(3),
    viewPublicKey: bytes(4),
    notificationUri: "nostr:npub1checksumtest",
  });
  const mutationOffset = "nnym_".length + 5;
  const replacement = address[mutationOffset] === "1" ? "3" : "1";
  const broken = `${address.slice(0, mutationOffset)}${replacement}${address.slice(mutationOffset + 1)}`;

  assert.throws(() => decodeNanoNymAddress(broken), /checksum|payload length/);
  assert.equal(isNanoNymAddress(broken), false);
});

test("requires a non-empty notification URI with a scheme", () => {
  assert.throws(
    () =>
      encodeNanoNymAddress({
        version: NANO_NYM_VERSION,
        spendPublicKey: bytes(5),
        viewPublicKey: bytes(6),
        notificationUri: "missing-scheme",
      }),
    /URI scheme/,
  );
});

test("computes deterministic checksums", () => {
  const payload = new Uint8Array([1, 2, 3, 4, 5]);

  assert.deepEqual(computeChecksum(payload), computeChecksum(payload));
  assert.equal(computeChecksum(payload).length, 2);
});

test("validates NanoNym payment events", () => {
  const event = {
    version: NANO_NYM_PAYMENT_EVENT_VERSION,
    protocol: NANO_NYM_PAYMENT_EVENT_PROTOCOL,
    R: "a".repeat(64),
    tx_hash: "b".repeat(64),
    amount_raw: "1000000000000000000000000000000",
    memo: "test payment",
  };

  assert.equal(validatePaymentEvent(event), true);
  assert.equal(validatePaymentEvent({ ...event, amount_raw: "01" }), false);
  assert.equal(validatePaymentEvent({ ...event, tx_hash: "B".repeat(64) }), false);
  assert.equal(validatePaymentEvent({ ...event, protocol: "other" }), false);
});
