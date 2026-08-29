import { RecoveryImportService } from './recovery-import.service';

describe('RecoveryImportService', () => {
  let service: RecoveryImportService;

  beforeEach(() => service = new RecoveryImportService());

  it('normalizes mnemonic separators and identifies a BIP-39-compatible phrase locally', () => {
    const candidate = service.classify('  abandon\n\tabandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about  ');

    expect(candidate.kind).toBe('mnemonic');
    expect(candidate.normalizedMaterial).toBe('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
    expect(candidate.wordCount).toBe(12);
    expect(candidate.interpretations).toEqual(['nano-seed', 'bip39-mnemonic']);
  });

  it('preserves a BIP-39 passphrase exactly when explicitly enabled', () => {
    const passphrase = '  Case-sensitive,  with punctuation!  ';
    const candidate = service.classify('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about', true, passphrase);

    expect(candidate.passphrase).toBe(passphrase);
  });

  it('classifies hex recovery material without choosing a semantic interpretation', () => {
    const candidate = service.classify('a'.repeat(64));
    expect(candidate.kind).toBe('hex-secret');
    expect(candidate.likely).toBe('nano-seed');
    expect(candidate.interpretations).toEqual(['nano-seed', 'private-key']);
  });

  it('recognizes expanded private keys and does not persist intake state', () => {
    const candidate = service.classify('A'.repeat(128));
    expect(candidate.kind).toBe('expanded-private-key');
    expect(candidate.interpretations).toEqual(['expanded-private-key']);
    expect((service as any).rawMaterial).toBeUndefined();
  });
});
