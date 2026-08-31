import { TestBed } from '@angular/core/testing';
import { ApiService } from './api.service';
import { RecoveryCandidate } from './recovery-import.service';
import { RecoveryVerificationService } from './recovery-verification.service';
import { UtilService } from './util.service';

function partial<T extends object>(value: T): any {
  const jasmineApi = (globalThis as any).jasmine;
  return jasmineApi?.objectContaining ? jasmineApi.objectContaining(value) : (expect as any).objectContaining(value);
}

describe('RecoveryVerificationService', () => {
  let service: RecoveryVerificationService;
  let api: {
    accountsBalances: ReturnType<typeof vi.fn>;
    accountsPending: ReturnType<typeof vi.fn>;
    accountHistory: ReturnType<typeof vi.fn>;
  };
  const util = {
    hex: { toUint8: (value: string) => new Uint8Array([parseInt(value.slice(0, 2), 16) || 0]) },
    account: {
      generateAccountSecretKeyBytes: (seed: Uint8Array, index: number) => new Uint8Array([(seed[0] || 0) + index + 1]),
      generateAccountKeyPair: (secret: Uint8Array) => ({ publicKey: new Uint8Array(32).fill(secret[0] || 0) }),
      getPublicAccountID: (publicKey: Uint8Array) => `nano_test_${publicKey[0] || 0}`,
    },
    string: { mnemonicToSeedSync: () => Buffer.from('seed') },
  };

  beforeEach(() => {
    api = {
      accountsBalances: vi.fn().mockResolvedValue({ balances: {} }),
      accountsPending: vi.fn().mockResolvedValue({ blocks: {} }),
      accountHistory: vi.fn().mockResolvedValue({ history: [] }),
    };
    TestBed.configureTestingModule({
      providers: [
        RecoveryVerificationService,
        { provide: UtilService, useValue: util },
        { provide: ApiService, useValue: api },
      ],
    });
    service = TestBed.inject(RecoveryVerificationService);
  });

  it('probes derived accounts and treats receivables and history as recovery evidence', async () => {
    const candidate: RecoveryCandidate = {
      kind: 'hex-secret',
      normalizedMaterial: 'A'.repeat(64),
      wordCount: null,
      likely: 'private-key',
      interpretations: ['private-key'],
    };
    api.accountsPending.mockImplementation(async accounts => ({ blocks: { [accounts[0]]: { HASH: { amount: '1' } } } }));
    api.accountHistory.mockResolvedValue({ history: [{ type: 'state' }] });

    const result = await service.verify(candidate, 0, 0);

    expect(api.accountsBalances).toHaveBeenCalledTimes(1);
    expect(api.accountsPending).toHaveBeenCalledTimes(1);
    expect(api.accountHistory).toHaveBeenCalledTimes(1);
    expect(result.accounts[0].pendingCount).toBe(1);
    expect(result.accounts[0].receivableRaw).toBe('1');
    expect(result.accounts[0].historyCount).toBe(1);
    expect(result.accounts[0].isOpened).toBe(true);
    expect(result.interpretations[0].openedAccounts).toBe(1);
    expect(result.interpretations[0].spendableRaw).toBe('0');
    expect(result.interpretations[0].receivableRaw).toBe('1');
    expect(result.interpretations[0].combinedRaw).toBe('1');
    expect(result.recommendedInterpretation).toBe('private-key');
    expect(result.activeInterpretations).toEqual(['private-key']);
    expect(result.hasActivity).toBe(true);
  });

  it('keeps a no-activity result editable and does not write any wallet state', async () => {
    const candidate: RecoveryCandidate = {
      kind: 'hex-secret',
      normalizedMaterial: 'B'.repeat(64),
      wordCount: null,
      likely: 'nano-seed',
      interpretations: ['nano-seed'],
    };

    const result = await service.verify(candidate, 0, 0);

    expect(result.hasActivity).toBe(false);
    expect(result.activeInterpretations).toEqual([]);
    expect((service as any).wallet).toBeUndefined();
  });

  it('checks the standard first ten seed accounts and recommends the interpretation with the greatest total', async () => {
    const candidate: RecoveryCandidate = {
      kind: 'hex-secret',
      normalizedMaterial: 'AA'.repeat(32),
      wordCount: null,
      likely: 'nano-seed',
      interpretations: ['nano-seed', 'private-key'],
    };
    api.accountsBalances.mockImplementation(async accounts => ({
      balances: {
        [accounts[10]]: { balance: '200' },
        [accounts[0]]: { balance: '100' },
      },
    }));
    api.accountsPending.mockImplementation(async accounts => ({
      blocks: { [accounts[0]]: { HASH: { amount: '25' } } },
    }));

    const result = await service.verify(candidate, 0, 9);

    expect(result.interpretations).toEqual([
      partial({ interpretation: 'nano-seed', checkedAccounts: 10, spendableRaw: '100', receivableRaw: '25', combinedRaw: '125' }),
      partial({ interpretation: 'private-key', checkedAccounts: 1, spendableRaw: '200', receivableRaw: '0', combinedRaw: '200' }),
    ]);
    expect(result.recommendedInterpretation).toBe('private-key');
  });

  it('does not treat a receivable-only account as opened', async () => {
    const candidate: RecoveryCandidate = {
      kind: 'hex-secret',
      normalizedMaterial: 'C'.repeat(64),
      wordCount: null,
      likely: 'private-key',
      interpretations: ['private-key'],
    };
    api.accountsPending.mockImplementation(async accounts => ({ blocks: { [accounts[0]]: { HASH: { amount: '1' } } } }));

    const result = await service.verify(candidate, 0, 0);

    expect(result.accounts[0].hasActivity).toBe(true);
    expect(result.accounts[0].isOpened).toBe(false);
    expect(result.interpretations[0]).toEqual(partial({ activeAccounts: 1, openedAccounts: 0, combinedRaw: '1' }));
  });

  it('keeps the canonical Nano seed selected when compatible interpretations have equal totals', async () => {
    const candidate: RecoveryCandidate = {
      kind: 'hex-secret',
      normalizedMaterial: 'AA'.repeat(32),
      wordCount: null,
      likely: 'nano-seed',
      interpretations: ['nano-seed', 'private-key'],
    };

    const result = await service.verify(candidate, 0, 0);

    expect(result.recommendedInterpretation).toBe('nano-seed');
  });

  it('ranks interpretations by recovered amount before observed transaction count', () => {
    const recommended = (service as any).selectRecommendedInterpretation([
      { interpretation: 'nano-seed', combinedRaw: '50', transactionCount: 1 },
      { interpretation: 'bip39-mnemonic', combinedRaw: '49', transactionCount: 20 },
    ]);

    expect(recommended).toBe('nano-seed');
  });

  it('uses observed transaction count when compatible interpretations recover the same amount', () => {
    const recommended = (service as any).selectRecommendedInterpretation([
      { interpretation: 'nano-seed', combinedRaw: '0', transactionCount: 5 },
      { interpretation: 'bip39-mnemonic', combinedRaw: '0', transactionCount: 2 },
    ]);

    expect(recommended).toBe('nano-seed');
  });

  it('probes only the BIP-39 interpretation when a passphrase is present', async () => {
    const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const passphrase = 'this is a BIP-39 passphrase';
    const candidate: RecoveryCandidate = {
      kind: 'mnemonic',
      normalizedMaterial: mnemonic,
      wordCount: 12,
      likely: 'bip39-mnemonic',
      // Verification must remain safe even if an upstream caller supplied an
      // ambiguous interpretation list with an explicit BIP-39 passphrase.
      interpretations: ['nano-seed', 'bip39-mnemonic'],
      passphrase,
    };
    const mnemonicToSeedSync = vi.spyOn(util.string, 'mnemonicToSeedSync').mockReturnValue(Buffer.alloc(64));

    const result = await service.verify(candidate, 0, 0);

    const calls = (mnemonicToSeedSync as any).mock?.calls?.at(-1) ?? (mnemonicToSeedSync as any).calls.mostRecent().args;
    expect(calls).toEqual([mnemonic, passphrase]);
    expect(result.interpretations.map(interpretation => interpretation.interpretation)).toEqual(['bip39-mnemonic']);
    expect(result.accounts.every(account => account.interpretation === 'bip39-mnemonic')).toBe(true);
  });
});
