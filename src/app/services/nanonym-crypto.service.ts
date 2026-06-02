import { Injectable } from "@angular/core";

// Type-only imports (erased at compile time)
import type { NanoNymPaymentEvent } from "@nanonyms/protocol";

// Runtime value imports — conditional on FEATURE_NANONYMS
let nip19: any;
let coreCreateIdentity: any, createNanoNymAddress: any, prepareNanoNymPayment: any, recoverStealthPayment: any;
let NANO_NYM_VERSION: any, createNostrNotificationUri: any, decodeNanoNymAddressV2: any, encodeNanoNymAddressV2: any;
let deriveNanoNymKeys: any, derivePublicKeyFromScalar: any, deriveStealthAddress: any, deriveStealthPrivateKey: any;
let generateEphemeralKey: any, generateSharedSecret: any, signBlockWithScalar: any;

if (FEATURE_NANONYMS) {
  nip19 = require("nostr-tools").nip19;
  const coreMod = require("@nanonyms/core");
  coreCreateIdentity = coreMod.createNanoNymIdentity;
  createNanoNymAddress = coreMod.createNanoNymAddress;
  prepareNanoNymPayment = coreMod.prepareNanoNymPayment;
  recoverStealthPayment = coreMod.recoverStealthPayment;
  const protocolMod = require("@nanonyms/protocol");
  NANO_NYM_VERSION = protocolMod.NANO_NYM_VERSION;
  createNostrNotificationUri = protocolMod.createNostrNotificationUri;
  decodeNanoNymAddressV2 = protocolMod.decodeNanoNymAddress;
  encodeNanoNymAddressV2 = protocolMod.encodeNanoNymAddress;
  const cryptoMod = require("@nanonyms/crypto");
  deriveNanoNymKeys = cryptoMod.deriveNanoNymKeys;
  derivePublicKeyFromScalar = cryptoMod.derivePublicKeyFromScalar;
  deriveStealthAddress = cryptoMod.deriveStealthAddress;
  deriveStealthPrivateKey = cryptoMod.deriveStealthPrivateKey;
  generateEphemeralKey = cryptoMod.generateEphemeralKey;
  generateSharedSecret = cryptoMod.generateSharedSecret;
  signBlockWithScalar = cryptoMod.signBlockWithScalar;
}

@Injectable({
  providedIn: "root",
})
export class NanoNymCryptoService {
  deriveNanoNymKeys(
    seed: string | Uint8Array,
    accountIndex: number,
  ): {
    spend: { private: Uint8Array; public: Uint8Array };
    view: { private: Uint8Array; public: Uint8Array };
    nostr: { private: Uint8Array; public: Uint8Array };
  } {
    const keys = deriveNanoNymKeys(seed, accountIndex);

    return {
      spend: {
        private: keys.spend.privateKey,
        public: keys.spend.publicKey,
      },
      view: {
        private: keys.view.privateKey,
        public: keys.view.publicKey,
      },
      nostr: {
        private: keys.nostr.privateKey,
        public: keys.nostr.publicKey,
      },
    };
  }

  createNanoNymIdentity(
    seed: string | Uint8Array,
    accountIndex: number,
  ) {
    return coreCreateIdentity(seed, accountIndex);
  }

  createNanoNymAddress(
    identity: ReturnType<typeof coreCreateIdentity>,
    notificationUri: string,
  ): string {
    return createNanoNymAddress(identity, notificationUri);
  }

  generateSharedSecret(
    privateKey: Uint8Array,
    publicKey: Uint8Array,
  ): Uint8Array {
    return generateSharedSecret(privateKey, publicKey);
  }

  deriveStealthAddress(
    sharedSecret: Uint8Array,
    _ephemeralPublic: Uint8Array,
    recipientSpendPublic: Uint8Array,
  ): { publicKey: Uint8Array; address: string } {
    return deriveStealthAddress(sharedSecret, recipientSpendPublic);
  }

  deriveStealthPrivateKey(
    spendPrivate: Uint8Array,
    sharedSecret: Uint8Array,
    _ephemeralPublic: Uint8Array,
    _spendPublic: Uint8Array,
  ): Uint8Array {
    return deriveStealthPrivateKey(spendPrivate, sharedSecret);
  }

  encodeNanoNymAddress(
    spendPublic: Uint8Array,
    viewPublic: Uint8Array,
    nostrPublic: Uint8Array,
  ): string {
    const npub = nip19.npubEncode(this.bytesToHex(nostrPublic));

    return encodeNanoNymAddressV2({
      version: NANO_NYM_VERSION,
      spendPublicKey: spendPublic,
      viewPublicKey: viewPublic,
      notificationUri: createNostrNotificationUri(npub),
    });
  }

  decodeNanoNymAddress(nnymAddress: string): {
    version: number;
    spendPublic: Uint8Array;
    viewPublic: Uint8Array;
    notificationUri: string;
  } {
    const decoded = decodeNanoNymAddressV2(nnymAddress);

    return {
      version: decoded.version,
      spendPublic: decoded.spendPublicKey,
      viewPublic: decoded.viewPublicKey,
      notificationUri: decoded.notificationUri,
    };
  }

  generateEphemeralKey(): { private: Uint8Array; public: Uint8Array } {
    const keyPair = generateEphemeralKey();
    return {
      private: keyPair.privateKey,
      public: keyPair.publicKey,
    };
  }

  prepareNanoNymPayment(
    recipientAddress: string,
    txHash: string,
    amountRaw?: bigint,
    memo?: string,
  ) {
    return prepareNanoNymPayment(recipientAddress, txHash, amountRaw, memo);
  }

  recoverStealthPayment(
    recipientKeys: {
      spend: { private: Uint8Array; public: Uint8Array };
      view: { private: Uint8Array; public: Uint8Array };
    },
    notification: NanoNymPaymentEvent,
  ) {
    return recoverStealthPayment(
      {
        spend: {
          privateKey: recipientKeys.spend.private,
          publicKey: recipientKeys.spend.public,
        },
        view: {
          privateKey: recipientKeys.view.private,
          publicKey: recipientKeys.view.public,
        },
      },
      notification,
    );
  }

  derivePublicKeyFromPrivate(privateKey: Uint8Array): Uint8Array {
    return derivePublicKeyFromScalar(privateKey);
  }

  signBlockWithScalar(
    privateKeyScalar: Uint8Array,
    messageHash: Uint8Array,
    expectedPublicKeyHex?: string,
  ): Uint8Array {
    const signature = signBlockWithScalar(privateKeyScalar, messageHash);

    if (expectedPublicKeyHex) {
      const derivedPublicHex = this.bytesToHex(
        derivePublicKeyFromScalar(privateKeyScalar),
      );
      if (derivedPublicHex.toLowerCase() !== expectedPublicKeyHex.toLowerCase()) {
        console.error(
          "[NanoNymCrypto] Public key mismatch for stealth scalar signing",
        );
      }
    }

    return signature;
  }

  private bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
}