import { PasskeyUnlockService } from './passkey-unlock.service';

describe('PasskeyUnlockService', () => {
  it('replaces a wallet enrollment with exactly one verified credential', async () => {
    const service = new PasskeyUnlockService();
    vi.spyOn(service, 'isAvailable').mockReturnValue(true);
    const prf = new Uint8Array(32).fill(7);
    const credential = {
      rawId: new Uint8Array([1, 2, 3]).buffer,
      getClientExtensionResults: () => ({ prf: { results: { first: prf } } }),
    } as unknown as PublicKeyCredential;
    const previousCredentials = navigator.credentials;
    const create = vi.fn().mockResolvedValue(credential);
    Object.defineProperty(navigator, 'credentials', { configurable: true, value: { create } });
    const walletId = service.newWalletId();

    let result;
    try {
      result = await service.enroll(walletId, 'seed', 'a'.repeat(64));
    } finally {
      Object.defineProperty(navigator, 'credentials', { configurable: true, value: previousCredentials });
    }

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.credentials).toHaveLength(1);
    expect(result.value.credentials[0].credentialId).toBe('AQID');
    expect((create.mock.calls[0][0] as CredentialCreationOptions).publicKey).not.toHaveProperty('excludeCredentials');
  });
});
