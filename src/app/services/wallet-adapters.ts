import { Injectable } from '@angular/core';
import * as CryptoJS from 'crypto-js';

/** Isolates the legacy wallet record's localStorage mechanics and JSON format. */
@Injectable({ providedIn: 'root' })
export class WalletPersistenceAdapter {
  read(key: string): string | null {
    return localStorage.getItem(key);
  }

  write(key: string, value: unknown): void {
    localStorage.setItem(key, JSON.stringify(value));
  }

  remove(key: string): void {
    localStorage.removeItem(key);
  }
}

/** Keeps the existing CryptoJS AES wallet-secret format behind an unlock seam. */
@Injectable({ providedIn: 'root' })
export class WalletSecretAdapter {
  encrypt(secret: string, password: string): string {
    return CryptoJS.AES.encrypt(secret, password).toString();
  }

  decrypt(encryptedSecret: string, password: string): string | null {
    try {
      return CryptoJS.AES.decrypt(encryptedSecret, password).toString(CryptoJS.enc.Utf8);
    } catch {
      return null;
    }
  }
}
