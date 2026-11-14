import { BigNumber } from 'bignumber.js';
import type { NanoConfirmationMessage } from './websocket.service';

export interface WalletTransactionClassification {
  incomingToWallet: boolean;
  sentFromWallet: boolean;
  receivedByWallet: boolean;
  shouldNotify: boolean;
}

/** Classifies a confirmed transaction against wallet accounts without side effects. */
export function classifyWalletTransaction(
  transaction: Pick<NanoConfirmationMessage, 'amount' | 'block'>,
  walletAccountIds: readonly string[],
  minimumReceiveRaw: BigNumber | null,
): WalletTransactionClassification {
  const block = transaction.block;
  const isStateSend = block.type === 'state' && block.subtype === 'send';
  const isStateReceive = block.type === 'state' && block.subtype === 'receive';
  const incomingToWallet = isStateSend && walletAccountIds.includes(block.link_as_account || '');
  const sentFromWallet = isStateSend && walletAccountIds.includes(block.account);
  const receivedByWallet = isStateReceive && walletAccountIds.includes(block.account);
  const meetsReceiveThreshold = minimumReceiveRaw === null || new BigNumber(transaction.amount).gte(minimumReceiveRaw);

  return {
    incomingToWallet,
    sentFromWallet,
    receivedByWallet,
    shouldNotify: meetsReceiveThreshold || sentFromWallet || receivedByWallet,
  };
}
