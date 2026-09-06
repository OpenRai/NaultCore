import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';
import {
  SelectedAccountContext,
  TransactionAccountContext,
  TransactionIntent,
  WALLET_ROUTE_CONTRACT,
  WalletDestination,
} from '../types/wallet-context.types';
import { WalletService } from './wallet.service';

export interface WalletNavigationTarget {
  commands: readonly string[];
  queryParams?: Readonly<Record<string, string>>;
}

/**
 * Stateless adapter between navigation and the WalletService account
 * authority. It never keeps a competing selected-account value.
 */
@Injectable()
export class WalletContextService {
  private readonly walletService = inject(WalletService);

  readonly selectedAccount$: Observable<SelectedAccountContext> = this.walletService.walletState$.pipe(
    map(snapshot => snapshot.selectedAccountId
      ? { kind: 'account' as const, accountId: snapshot.selectedAccountId }
      : { kind: 'aggregate' as const, accountId: null }),
    distinctUntilChanged((previous, current) => previous.kind === current.kind && previous.accountId === current.accountId),
  );

  get selectedAccount(): SelectedAccountContext {
    return this.toSelectedAccountContext(this.walletService.walletState.selectedAccountId);
  }

  selectAccount(accountId: string | null): SelectedAccountContext {
    if (accountId !== null && !this.walletService.getWalletAccount(accountId)) {
      return this.selectedAccount;
    }

    this.walletService.selectAccount(accountId);
    this.walletService.saveWalletExport();
    return this.selectedAccount;
  }

  resolveTransactionContext(intent: TransactionIntent, requestedAccountId?: string | null): TransactionAccountContext {
    if (requestedAccountId) {
      const requested = this.walletService.getWalletAccount(requestedAccountId);
      if (requested) {
        return { intent, accountId: requested.id, source: 'query', explicit: true };
      }
    }

    const selectedAccount = this.walletService.walletState.selectedAccount;
    if (selectedAccount) {
      return { intent, accountId: selectedAccount.id, source: 'selected', explicit: false };
    }

    const fallback = this.walletService.walletState.accounts[0];
    if (fallback) {
      return { intent, accountId: fallback.id, source: 'fallback', explicit: false };
    }

    return { intent, accountId: null, source: 'none', explicit: false };
  }

  destination(destination: WalletDestination): WalletNavigationTarget {
    switch (destination) {
      case 'wallet':
        return { commands: [WALLET_ROUTE_CONTRACT.wallet] };
      case 'accounts':
        return { commands: [WALLET_ROUTE_CONTRACT.accounts] };
      case 'address-book':
        return { commands: ['/address-book'] };
      case 'qr-scan':
        return { commands: [WALLET_ROUTE_CONTRACT.qrScan] };
    }
  }

  transaction(intent: TransactionIntent, accountId?: string | null): WalletNavigationTarget {
    const route = intent === 'send' ? WALLET_ROUTE_CONTRACT.send : WALLET_ROUTE_CONTRACT.receive;
    return accountId
      ? { commands: [route], queryParams: { [WALLET_ROUTE_CONTRACT.accountQueryParam]: accountId } }
      : { commands: [route] };
  }

  private toSelectedAccountContext(accountId: string | null): SelectedAccountContext {
    return accountId
      ? { kind: 'account', accountId }
      : { kind: 'aggregate', accountId: null };
  }
}
