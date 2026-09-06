/**
 * The account-context contract for wallet navigation.
 *
 * `WalletService` owns the selected account. This contract describes how UI
 * destinations and transaction flows consume that selection without making
 * the sidebar or a transaction route a second source of truth.
 */
export type WalletDestination =
  | 'wallet'
  | 'accounts'
  | 'address-book'
  | 'qr-scan';

export type TransactionIntent = 'send' | 'receive';

export type SelectedAccountContext =
  | { kind: 'aggregate'; accountId: null }
  | { kind: 'account'; accountId: string };

export type TransactionAccountSource = 'query' | 'selected' | 'fallback' | 'none';

export interface TransactionAccountContext {
  intent: TransactionIntent;
  accountId: string | null;
  source: TransactionAccountSource;
  explicit: boolean;
}

export interface WalletRouteContract {
  readonly wallet: '/wallet';
  readonly accounts: '/accounts';
  readonly send: '/send';
  readonly receive: '/receive';
  readonly qrScan: '/qr-scan';
  readonly accountQueryParam: 'account';
}

export const WALLET_ROUTE_CONTRACT: WalletRouteContract = Object.freeze({
  wallet: '/wallet',
  accounts: '/accounts',
  send: '/send',
  receive: '/receive',
  qrScan: '/qr-scan',
  accountQueryParam: 'account',
});
