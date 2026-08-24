import { Injectable, inject } from '@angular/core';
import { environment } from 'environments/environment';
import { WalletService } from './wallet.service';

declare global {
  interface Window {
    __NAULTCORE_E2E__?: {
      unlock(password: string): boolean;
    };
  }
}

@Injectable()
export class E2eUnlockBridgeService {
  private walletService = inject(WalletService);

  constructor() {
    if (environment.e2eUnlockBridge) {
      window.__NAULTCORE_E2E__ = {
        unlock: (password: string): boolean =>
          typeof password === 'string' && this.walletService.unlockWallet(password),
      };
    }
  }
}
