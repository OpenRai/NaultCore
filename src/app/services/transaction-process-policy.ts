import type { TxType } from './util.service';

export type TransactionProcessOutcome =
  | { kind: 'accepted'; hash: string; response: unknown }
  | { kind: 'rejected'; reason: string; response: unknown }
  | { kind: 'failed'; error: unknown };

type TransactionProcessor = {
  process(block: unknown, subtype: TxType): Promise<unknown>;
};

/** Normalize Nano RPC process outcomes while keeping signing and UI policy with their owners. */
export async function processTransactionBlock(
  processor: TransactionProcessor,
  block: unknown,
  subtype: TxType,
): Promise<TransactionProcessOutcome> {
  try {
    const response: any = await processor.process(block, subtype);
    if (response?.hash) return { kind: 'accepted', hash: response.hash, response };
    return {
      kind: 'rejected',
      reason: response?.error || 'Node returned an error',
      response,
    };
  } catch (error) {
    return { kind: 'failed', error };
  }
}
