import { RecoveryImportService } from './recovery-import.service';

function partial<T extends object>(value: T): any {
  return expect.objectContaining(value);
}

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
    expect(candidate.interpretations).toEqual(['bip39-mnemonic']);
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

  it('reports BIP-39 word recognition without treating known words as a valid phrase', () => {
    const statuses = service.inspectMnemonicWords('abandon notaword about');

    expect(statuses).toEqual([
      { word: 'abandon', recognized: true },
      { word: 'notaword', recognized: false },
      { word: 'about', recognized: true },
    ]);
    expect(service.classify('abandon about abandon')).toEqual(partial({ kind: 'unknown' }));
  });

  it('shows word-level feedback only at supported Nano and BIP-39 phrase lengths', () => {
    for (const wordCount of [12, 15, 18, 21, 24]) {
      expect(service.hasSupportedMnemonicWordCount(Array(wordCount).fill('abandon').join(' '))).toBe(true);
    }
    for (const wordCount of [0, 1, 11, 13, 17, 25]) {
      expect(service.hasSupportedMnemonicWordCount(Array(wordCount).fill('abandon').join(' '))).toBe(false);
    }
  });

  it('assembles the browser-independent recovery material inspection state', () => {
    const inspection = service.inspectMaterial('  abandon\n\tabandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about  ');

    expect(inspection.material).toBe('abandon\n\tabandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
    expect(inspection.candidate.kind).toBe('mnemonic');
    expect(inspection.candidate.normalizedMaterial).toBe('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
    expect(inspection.invalid).toBe(false);
    expect(inspection.mnemonicWordStatuses.length).toBe(12);
    expect(inspection.wordCheckVisible).toBe(true);
    expect(inspection.isBip39).toBe(true);
  });

  it('marks non-empty unknown material invalid while retaining word-level diagnostics', () => {
    const inspection = service.inspectMaterial('abandon notaword about');

    expect(inspection.invalid).toBe(true);
    expect(inspection.isBip39).toBe(false);
    expect(inspection.mnemonicWordStatuses).toEqual([
      { word: 'abandon', recognized: true },
      { word: 'notaword', recognized: false },
      { word: 'about', recognized: true },
    ]);
  });

  it('describes each supported recovery candidate without retaining input state', () => {
    expect(service.describeCandidate(service.classify('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about')))
      .toBe('12-word secret recovery mnemonic');
    expect(service.describeCandidate(service.classify('a'.repeat(64))))
      .toBe('64-character hexadecimal secret');
    expect(service.describeCandidate(service.classify('a'.repeat(128))))
      .toBe('128-character expanded private key');
    expect((service as any).rawMaterial).toBeUndefined();
  });
});
