export interface NanoNymKeyPair {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
}

export interface NanoNymKeys {
  spend: NanoNymKeyPair;
  view: NanoNymKeyPair;
  nostr: NanoNymKeyPair;
}

export interface DerivedStealthAddress {
  publicKey: Uint8Array;
  address: string;
}

export interface EphemeralKeyPair {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
}


