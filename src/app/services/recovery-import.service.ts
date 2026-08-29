import { Injectable } from '@angular/core';
import * as bip39 from 'bip39';

export type RecoveryCandidateKind = 'mnemonic' | 'hex-secret' | 'expanded-private-key' | 'unknown';
export type RecoveryInterpretation = 'nano-seed' | 'bip39-mnemonic' | 'private-key' | 'expanded-private-key';

export interface RecoveryCandidate {
  kind: RecoveryCandidateKind;
  /** Normalized in-memory material. Never persist or log this value. */
  normalizedMaterial: string;
  wordCount: number | null;
  likely: RecoveryInterpretation | null;
  interpretations: ReadonlyArray<RecoveryInterpretation>;
  passphrase?: string;
}

/** Local-only recovery intake and classification. It does not probe nodes or persist wallet material. */
@Injectable({ providedIn: 'root' })
export class RecoveryImportService {
  classify(rawMaterial: string, passphraseEnabled = false, passphrase = ''): RecoveryCandidate {
    const material = String(rawMaterial || '').trim();
    if (!material) return this.unknown(material);

    const mnemonic = this.normalizeMnemonic(material);
    const words = mnemonic ? mnemonic.split(' ') : [];
    const bip39Valid = words.length > 0 && bip39.validateMnemonic(mnemonic.toLowerCase());
    if (bip39Valid) {
      return {
        kind: 'mnemonic',
        normalizedMaterial: mnemonic.toLowerCase(),
        wordCount: words.length,
        likely: 'bip39-mnemonic',
        interpretations: ['nano-seed', 'bip39-mnemonic'],
        // Passphrases are intentionally copied byte-for-byte. Do not trim,
        // case-fold, normalize, or otherwise reinterpret this value.
        ...(passphraseEnabled ? { passphrase } : {}),
      };
    }

    if (/^[0-9a-fA-F]{128}$/.test(material)) {
      return {
        kind: 'expanded-private-key',
        normalizedMaterial: material,
        wordCount: null,
        likely: 'expanded-private-key',
        interpretations: ['expanded-private-key'],
      };
    }

    if (/^[0-9a-fA-F]{64}$/.test(material)) {
      return {
        kind: 'hex-secret',
        normalizedMaterial: material,
        wordCount: null,
        likely: 'nano-seed',
        interpretations: ['nano-seed', 'private-key'],
      };
    }

    return this.unknown(material);
  }

  private normalizeMnemonic(material: string): string {
    const words = material.split(/\s+/).filter(Boolean);
    return words.length > 1 ? words.join(' ') : '';
  }

  private unknown(material: string): RecoveryCandidate {
    return {
      kind: 'unknown',
      normalizedMaterial: material,
      wordCount: null,
      likely: null,
      interpretations: [],
    };
  }
}
