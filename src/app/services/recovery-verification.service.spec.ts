import { TestBed } from '@angular/core/testing';
import { ApiService } from './api.service';
import { RecoveryCandidate } from './recovery-import.service';
import { RecoveryVerificationService } from './recovery-verification.service';
import { UtilService } from './util.service';

describe('RecoveryVerificationService', () => {
  let service: RecoveryVerificationService;
  let api: jasmine.SpyObj<ApiService>;
  const util = {
    hex: { toUint8: (value: string) => new Uint8Array(Math.max(1, value.length / 2)) },
    account: {
      generateAccountSecretKeyBytes: (_seed: Uint8Array, index: number) => new Uint8Array([index]),
      generateAccountKeyPair: (secret: Uint8Array) => ({ publicKey: new Uint8Array(32).fill(secret[0] || 0) }),
      getPublicAccountID: (publicKey: Uint8Array) => `nano_test_${publicKey[0] || 0}`,
    },
    string: { mnemonicToSeedSync: () => Buffer.from('seed') },
  };

  beforeEach(() => {
    api = jasmine.createSpyObj<ApiService>('ApiService', ['accountsBalances', 'accountsPending', 'accountHistory']);
    api.accountsBalances.and.resolveTo({ balances: {} });
    api.accountsPending.and.resolveTo({ blocks: {} });
    api.accountHistory.and.resolveTo({ history: [] });
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
    api.accountsPending.and.callFake(async accounts => ({ blocks: { [accounts[0]]: { HASH: { amount: '1' } } } }));
    api.accountHistory.and.resolveTo({ history: [{ type: 'state' }] });

    const result = await service.verify(candidate, 0, 0);

    expect(api.accountsBalances).toHaveBeenCalledTimes(1);
    expect(api.accountsPending).toHaveBeenCalledTimes(1);
    expect(api.accountHistory).toHaveBeenCalledTimes(1);
    expect(result.accounts[0].pendingCount).toBe(1);
    expect(result.accounts[0].historyCount).toBe(1);
    expect(result.activeInterpretations).toEqual(['private-key']);
    expect(result.hasActivity).toBeTrue();
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

    expect(result.hasActivity).toBeFalse();
    expect(result.activeInterpretations).toEqual([]);
    expect((service as any).wallet).toBeUndefined();
  });
});
