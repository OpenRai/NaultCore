import { Injectable } from '@angular/core';

export interface PasskeyEnvelope {
  version: 1;
  credentialId: string;
  label: string;
  createdAt: number;
  salt: string;
  iv: string;
  ciphertext: string;
}

export interface PasskeyUnlockRecord {
  walletId: string;
  rpId: string;
  credentials: PasskeyEnvelope[];
}

export type PasskeyResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: 'unavailable' | 'unsupported' | 'cancelled' | 'failed' };

interface PasskeyCeremonyResult {
  credentialId: string;
  prf: Uint8Array;
}

@Injectable({ providedIn: 'root' })
export class PasskeyUnlockService {
  readonly rpId = this.configuredRpId();

  private configuredRpId(): string {
    try {
      return WEBAUTHN_RP_ID || 'localhost';
    } catch {
      return 'localhost';
    }
  }

  isAvailable(): boolean {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
    if (!window.isSecureContext || !navigator.credentials || !window.PublicKeyCredential || !window.crypto?.subtle) return false;
    const labels = this.rpId.split('.');
    if (this.rpId.length > 253 || !labels.length || labels.some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))) return false;
    const host = window.location.hostname.toLowerCase();
    const rpId = this.rpId.toLowerCase();
    return host === rpId || host.endsWith(`.${rpId}`);
  }

  newWalletId(): string {
    return this.toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  }

  async enroll(walletId: string, walletType: string, secret: string): Promise<PasskeyResult<PasskeyUnlockRecord>> {
    if (!this.isAvailable()) return { ok: false, reason: 'unavailable' };
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const salt = crypto.getRandomValues(new Uint8Array(32));
    let credential: PublicKeyCredential;
    let prf: Uint8Array|null;
    try {
      credential = await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { id: this.rpId, name: 'NaultCore' },
          user: { id: this.fromBase64Url(walletId), name: 'NaultCore wallet', displayName: 'NaultCore wallet' },
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
          timeout: 60000,
          attestation: 'none',
          authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
          extensions: { prf: { eval: { first: salt } } },
        } as any,
      }) as PublicKeyCredential;
      if (!credential) return { ok: false, reason: 'cancelled' };
      const result = (credential.getClientExtensionResults() as any)?.prf;
      prf = result?.results?.first ? new Uint8Array(result.results.first) : null;
      if (result?.enabled === false) return { ok: false, reason: 'unsupported' };
      if (prf && prf.length !== 32) return { ok: false, reason: 'unsupported' };
    } catch (error) {
      return { ok: false, reason: this.failureReason(error) };
    }

    const credentialId = this.toBase64Url(new Uint8Array(credential.rawId));
    if (!prf) {
      const assertion = await this.requestPrf([{ credentialId, salt }]);
      if ('reason' in assertion) return { ok: false, reason: assertion.reason };
      prf = assertion.value.prf;
    }

    const envelope = await this.encryptEnvelope(walletId, walletType, credentialId, secret, salt, prf);
    const verified = envelope ? await this.decryptEnvelope(walletId, walletType, envelope, prf) : null;
    prf.fill(0);
    if (!envelope || verified !== secret) return { ok: false, reason: 'failed' };
    return { ok: true, value: { walletId, rpId: this.rpId, credentials: [envelope] } };
  }

  async unlock(record: PasskeyUnlockRecord, walletType: string, signal?: AbortSignal): Promise<PasskeyResult<{ secret: string; credentialId: string }>> {
    if (!this.isAvailable() || record.rpId !== this.rpId) return { ok: false, reason: 'unavailable' };
    const credentials = record.credentials.filter(item => item.version === 1 && item.credentialId && item.salt);
    if (!credentials.length) return { ok: false, reason: 'unsupported' };
    const result = await this.requestPrf(credentials.map(item => ({ credentialId: item.credentialId, salt: this.fromBase64Url(item.salt) })), signal);
    if ('reason' in result) return { ok: false, reason: result.reason };
    if (signal?.aborted) {
      result.value.prf.fill(0);
      return { ok: false, reason: 'cancelled' };
    }
    const envelope = credentials.find(item => item.credentialId === result.value.credentialId);
    if (!envelope) {
      result.value.prf.fill(0);
      return { ok: false, reason: 'failed' };
    }
    const secret = await this.decryptEnvelope(record.walletId, walletType, envelope, result.value.prf);
    result.value.prf.fill(0);
    return secret ? { ok: true, value: { secret, credentialId: envelope.credentialId } } : { ok: false, reason: 'failed' };
  }

  async remove(record: PasskeyUnlockRecord, credentialId: string): Promise<PasskeyUnlockRecord|null> {
    const credentials = record.credentials.filter(item => item.credentialId !== credentialId);
    return credentials.length ? { ...record, credentials } : null;
  }

  private async requestPrf(entries: Array<{ credentialId: string; salt: Uint8Array }>, signal?: AbortSignal): Promise<PasskeyResult<PasskeyCeremonyResult>> {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const evalByCredential: Record<string, { first: Uint8Array }> = {};
    for (const entry of entries) evalByCredential[entry.credentialId] = { first: entry.salt };
    try {
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge,
          rpId: this.rpId,
          allowCredentials: entries.map(entry => ({ type: 'public-key', id: this.fromBase64Url(entry.credentialId) })),
          userVerification: 'required',
          timeout: 60000,
          extensions: { prf: { evalByCredential } },
        } as any,
        signal,
      }) as PublicKeyCredential;
      if (signal?.aborted) return { ok: false, reason: 'cancelled' };
      if (!assertion) return { ok: false, reason: 'cancelled' };
      const prf = (assertion.getClientExtensionResults() as any)?.prf?.results?.first;
      const bytes = prf ? new Uint8Array(prf) : null;
      if (!bytes || bytes.length !== 32) return { ok: false, reason: 'unsupported' };
      return { ok: true, value: { credentialId: this.toBase64Url(new Uint8Array(assertion.rawId)), prf: bytes } };
    } catch (error) {
      return { ok: false, reason: this.failureReason(error) };
    }
  }

  private async encryptEnvelope(walletId: string, walletType: string, credentialId: string, secret: string, salt: Uint8Array, prf: Uint8Array): Promise<PasskeyEnvelope|null> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const additionalData = this.additionalData(walletId, walletType, credentialId);
    try {
      const key = await this.deriveKey(prf, salt);
      const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: this.bufferSource(iv), additionalData: this.bufferSource(additionalData), tagLength: 128 }, key, this.bufferSource(new TextEncoder().encode(secret)));
      return { version: 1, credentialId, label: 'NaultCore wallet', createdAt: Date.now(), salt: this.toBase64Url(salt), iv: this.toBase64Url(iv), ciphertext: this.toBase64Url(new Uint8Array(ciphertext)) };
    } catch {
      return null;
    }
  }

  private async decryptEnvelope(walletId: string, walletType: string, envelope: PasskeyEnvelope, prf: Uint8Array): Promise<string|null> {
    try {
      const key = await this.deriveKey(prf, this.fromBase64Url(envelope.salt));
      const plaintext = await crypto.subtle.decrypt({
        name: 'AES-GCM', iv: this.bufferSource(this.fromBase64Url(envelope.iv)), additionalData: this.bufferSource(this.additionalData(walletId, walletType, envelope.credentialId)), tagLength: 128,
      }, key, this.bufferSource(this.fromBase64Url(envelope.ciphertext)));
      return new TextDecoder('utf-8', { fatal: true }).decode(plaintext);
    } catch {
      return null;
    }
  }

  private async deriveKey(prf: Uint8Array, salt: Uint8Array): Promise<CryptoKey> {
    const material = await crypto.subtle.importKey('raw', this.bufferSource(prf), 'HKDF', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: this.bufferSource(salt), info: this.bufferSource(new TextEncoder().encode('NaultCore passkey wallet unlock v1')) }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  private bufferSource(bytes: Uint8Array): BufferSource {
    return bytes.slice().buffer as ArrayBuffer;
  }

  private additionalData(walletId: string, walletType: string, credentialId: string): Uint8Array {
    return new TextEncoder().encode(JSON.stringify({ version: 1, algorithm: 'HKDF-SHA-256/AES-256-GCM', walletId, walletType, rpId: this.rpId, credentialId }));
  }

  private failureReason(error: unknown): 'unavailable' | 'unsupported' | 'cancelled' | 'failed' {
    if (error instanceof DOMException && error.name === 'NotAllowedError') return 'cancelled';
    if (error instanceof DOMException && (error.name === 'NotSupportedError' || error.name === 'SecurityError')) return 'unsupported';
    return 'failed';
  }

  private toBase64Url(bytes: Uint8Array): string {
    let binary = '';
    bytes.forEach(byte => binary += String.fromCharCode(byte));
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  private fromBase64Url(value: string): Uint8Array {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
    return Uint8Array.from(atob(base64), char => char.charCodeAt(0));
  }
}
