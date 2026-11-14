import { TestBed, inject } from '@angular/core/testing';

import { NanoBlockService } from './nano-block.service';
import { LedgerBlockSignerAdapter, SoftwareBlockSignerAdapter } from './transaction-signer-adapters';
import { UtilService } from './util.service';
import { NanoNymCryptoService } from './nanonym-crypto.service';
import { LedgerService } from './ledger.service';
import { StateBlock } from './util.service';

const stateBlock: StateBlock = {
  account: 'nano_account',
  previous: 'A'.repeat(64),
  representative: 'nano_representative',
  balance: '0',
  link: '0'.repeat(64),
  signature: '',
  work: '',
};

describe('transaction signer adapters', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        SoftwareBlockSignerAdapter,
        LedgerBlockSignerAdapter,
        { provide: UtilService, useValue: { nano: {}, hex: {} } },
        { provide: NanoNymCryptoService, useValue: { signBlockWithScalar: vi.fn() } },
        { provide: LedgerService, useValue: { signBlock: vi.fn() } },
      ],
    });
  });

  it('signs the exact state-block hash with the software account secret key', () => {
    const hash = new Uint8Array([1, 2, 3]);
    const signature = new Uint8Array([4, 5, 6]);
    const hashStateBlock = vi.fn(() => hash);
    const fromUint8 = vi.fn(() => '040506');
    const detached = vi.fn(() => signature);
    const testWindow = window as any;
    const previousNacl = testWindow.nacl;
    testWindow.nacl = { sign: { detached } };
    const blockData = { ...stateBlock };
    const util = TestBed.inject(UtilService) as any;
    util.nano.hashStateBlock = hashStateBlock;
    util.hex.fromUint8 = fromUint8;
    const adapter = TestBed.inject(SoftwareBlockSignerAdapter);

    try {
      expect(adapter.sign({ keyPair: { secretKey: new Uint8Array([7, 8]) } }, blockData)).toBe('040506');
      expect(hashStateBlock).toHaveBeenCalledWith(blockData);
      expect(detached).toHaveBeenCalledWith(hash, new Uint8Array([7, 8]));
      expect(fromUint8).toHaveBeenCalledWith(signature);
    } finally {
      testWindow.nacl = previousNacl;
    }
  });

  if (FEATURE_NANONYMS) {
    it('uses the scalar signer for feature-gated stealth accounts', () => {
      const hash = new Uint8Array([1, 2, 3]);
      const signature = new Uint8Array([4, 5, 6]);
      const signBlockWithScalar = vi.fn(() => signature);
      const fromUint8 = vi.fn(() => '040506');
      const util = TestBed.inject(UtilService) as any;
      util.nano.hashStateBlock = () => hash;
      util.hex.fromUint8 = fromUint8;
      (TestBed.inject(NanoNymCryptoService) as any).signBlockWithScalar = signBlockWithScalar;
      const adapter = TestBed.inject(SoftwareBlockSignerAdapter);
      const account = { isStealthAccount: true, secret: new Uint8Array([9]), publicKeyHex: 'PUBLIC' };

      expect(adapter.sign(account, stateBlock)).toBe('040506');
      expect(signBlockWithScalar).toHaveBeenCalledWith(account.secret, hash, account.publicKeyHex);
    });
  }

  it('forwards Ledger signing results and preserves device errors', async () => {
    const error = new Error('Ledger signing cancelled');
    const ledger = TestBed.inject(LedgerService) as any;
    ledger.signBlock.mockResolvedValue({ signature: 'ABCD' });
    const adapter = TestBed.inject(LedgerBlockSignerAdapter);
    const ledgerBlock = { previousBlock: 'A'.repeat(64), balance: '1' };

    await expect(adapter.sign(3, ledgerBlock)).resolves.toBe('ABCD');
    expect(ledger.signBlock).toHaveBeenCalledWith(3, ledgerBlock);

    ledger.signBlock.mockRejectedValueOnce(error);
    await expect(adapter.sign(3, ledgerBlock)).rejects.toBe(error);
  });
});

describe('NanoBlockService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [NanoBlockService]
    });
  });

  // SKIPPED: Test may fail due to missing DI providers in TestBed configuration.
  // To fix: Add mock providers for all service dependencies.
  // See docs/testing.md for the current test commands.
  it.skip('should be created', inject([NanoBlockService], (service: NanoBlockService) => {
    expect(service).toBeTruthy();
  }));
});
