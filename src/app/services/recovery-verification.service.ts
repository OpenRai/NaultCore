import { Injectable, inject } from '@angular/core';
import * as bip39 from 'bip39';
import { wallet } from 'nanocurrency-web';
import BigNumber from 'bignumber.js';
import { ApiService } from './api.service';
import { RecoveryCandidate, RecoveryInterpretation } from './recovery-import.service';
import { UtilService } from './util.service';

export interface RecoveryAccountEvidence {
  interpretation: RecoveryInterpretation;
  index: number;
  account: string;
  balanceRaw: string;
  pendingCount: number;
  historyCount: number;
  hasActivity: boolean;
}

export interface RecoveryVerificationResult {
  checkedAt: number;
  scanStart: number;
  scanEnd: number;
  accounts: ReadonlyArray<RecoveryAccountEvidence>;
  activeInterpretations: ReadonlyArray<RecoveryInterpretation>;
  hasActivity: boolean;
}

export interface KnownAddressEvidence {
  account: string;
  balanceRaw: string;
  pendingCount: number;
  historyCount: number;
  hasActivity: boolean;
}

interface DerivedAccount {
  interpretation: RecoveryInterpretation;
  index: number;
  account: string;
}

/** Probes recovery interpretations without creating, replacing, or persisting a wallet. */
@Injectable({ providedIn: 'root' })
export class RecoveryVerificationService {
  private readonly api = inject(ApiService);
  private readonly util = inject(UtilService);

  async verify(candidate: RecoveryCandidate, scanStart = 0, scanEnd = 19): Promise<RecoveryVerificationResult> {
    const start = Math.max(0, Math.floor(scanStart));
    const end = Math.min(100, Math.max(start, Math.floor(scanEnd)));
    const derived = candidate.interpretations.flatMap(interpretation => this.deriveAccounts(candidate, interpretation, start, end));
    if (!derived.length) throw new Error('No compatible recovery interpretation is available.');

    const accountIds = derived.map(account => account.account);
    const [balances, pending, history] = await Promise.all([
      this.api.accountsBalances(accountIds),
      this.api.accountsPending(accountIds, 50),
      Promise.all(derived.map(account => this.api.accountHistory(account.account, 1, false))),
    ]);

    const evidence = derived.map((derivedAccount, index) => {
      const balance = balances?.balances?.[derivedAccount.account]?.balance || '0';
      const pendingCount = this.pendingCount(pending?.blocks?.[derivedAccount.account]);
      const historyCount = Array.isArray(history[index]?.history) ? history[index].history.length : 0;
      const hasActivity = new BigNumber(balance).gt(0) || pendingCount > 0 || historyCount > 0;
      return {
        interpretation: derivedAccount.interpretation,
        index: derivedAccount.index,
        account: derivedAccount.account,
        balanceRaw: balance,
        pendingCount,
        historyCount,
        hasActivity,
      };
    });
    const activeInterpretations = [...new Set(evidence.filter(item => item.hasActivity).map(item => item.interpretation))];
    return {
      checkedAt: Date.now(),
      scanStart: start,
      scanEnd: end,
      accounts: evidence,
      activeInterpretations,
      hasActivity: activeInterpretations.length > 0,
    };
  }

  async lookupKnownAddress(account: string): Promise<KnownAddressEvidence> {
    const normalized = account.trim().replace(/^xrb_/, 'nano_');
    if (!this.util.account.isValidAccount(normalized)) throw new Error('Enter a valid Nano account address.');
    const [info, pending, history] = await Promise.all([
      this.api.accountInfo(normalized),
      this.api.pending(normalized, 50),
      this.api.accountHistory(normalized, 1, false),
    ]);
    const balanceRaw = info?.balance || '0';
    const pendingCount = this.pendingCount(pending?.blocks);
    const historyCount = Array.isArray(history?.history) ? history.history.length : 0;
    return {
      account: normalized,
      balanceRaw,
      pendingCount,
      historyCount,
      hasActivity: new BigNumber(balanceRaw).gt(0) || pendingCount > 0 || historyCount > 0,
    };
  }

  private deriveAccounts(candidate: RecoveryCandidate, interpretation: RecoveryInterpretation, start: number, end: number): DerivedAccount[] {
    if (interpretation === 'private-key' || interpretation === 'expanded-private-key') {
      const key = candidate.normalizedMaterial.slice(0, 64);
      const keyPair = this.util.account.generateAccountKeyPair(this.util.hex.toUint8(key), interpretation === 'expanded-private-key');
      return [{ interpretation, index: 0, account: this.util.account.getPublicAccountID(keyPair.publicKey) }];
    }

    if (interpretation === 'bip39-mnemonic') {
      const seed = this.util.string.mnemonicToSeedSync(candidate.normalizedMaterial, candidate.passphrase || '').toString('hex');
      return wallet.accounts(seed, start, end).map((account, offset) => ({
        interpretation,
        index: start + offset,
        account: account.address.replace('xrb_', 'nano_'),
      }));
    }

    const entropy = candidate.kind === 'mnemonic'
      ? bip39.mnemonicToEntropy(candidate.normalizedMaterial)
      : candidate.normalizedMaterial;
    const seedBytes = this.util.hex.toUint8(entropy);
    return Array.from({ length: end - start + 1 }, (_, offset) => {
      const index = start + offset;
      const secret = this.util.account.generateAccountSecretKeyBytes(seedBytes, index);
      const keyPair = this.util.account.generateAccountKeyPair(secret);
      return { interpretation, index, account: this.util.account.getPublicAccountID(keyPair.publicKey) };
    });
  }

  private pendingCount(value: unknown): number {
    if (Array.isArray(value)) return value.length;
    if (value && typeof value === 'object') return Object.keys(value).length;
    return 0;
  }
}
