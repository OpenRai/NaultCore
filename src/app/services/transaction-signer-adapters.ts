import { Injectable, inject } from '@angular/core';
import { StateBlock, UtilService } from './util.service';
import { NanoNymCryptoService } from './nanonym-crypto.service';
import { LedgerService } from './ledger.service';

interface SoftwareSigningAccount {
  secret?: Uint8Array;
  keyPair?: { secretKey: Uint8Array };
  isStealthAccount?: boolean;
  publicKeyHex?: string;
}

/** Signs the same state-block hash using the wallet's configured software key. */
@Injectable({ providedIn: 'root' })
export class SoftwareBlockSignerAdapter {
  private util = inject(UtilService);
  private nanonymCrypto = inject(NanoNymCryptoService);

  sign(account: SoftwareSigningAccount, blockData: StateBlock): string {
    const hashBytes = this.util.nano.hashStateBlock(blockData);
    let signed: Uint8Array;

    if (FEATURE_NANONYMS && account.isStealthAccount) {
      console.log('[NanoBlock] Signing stealth account block using scalar signing');
      console.log('[NanoBlock] Stealth account public key:', account.publicKeyHex);
      signed = this.nanonymCrypto.signBlockWithScalar(
        account.secret,
        hashBytes,
        account.publicKeyHex,
      );
    } else {
      const nacl = window['nacl'];
      signed = nacl.sign.detached(hashBytes, account.keyPair.secretKey);
    }

    return this.util.hex.fromUint8(signed);
  }
}

/** Keeps Ledger block signing behind a narrow, independently testable port. */
@Injectable({ providedIn: 'root' })
export class LedgerBlockSignerAdapter {
  private ledger = inject(LedgerService);

  async sign(accountIndex: number, ledgerBlock: unknown): Promise<string> {
    const signed = await this.ledger.signBlock(accountIndex, ledgerBlock);
    return signed.signature;
  }
}
