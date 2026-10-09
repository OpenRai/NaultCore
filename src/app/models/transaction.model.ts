import BigNumber from 'bignumber.js';

export type TransactionDirection = 'sent' | 'received';
export type TransactionStatus = 'confirmed' | 'pending';
export type DirectionFilter = 'all' | TransactionDirection;

/**
 * One movement of value on a local wallet account's chain.
 *
 * Confirmed and pending receivable blocks are the same shape so a single table
 * can show both without the reader having to work out which rows are real yet.
 */
export interface WalletTransaction {
  hash: string;
  /** The local wallet account this movement belongs to. */
  accountId: string;
  accountLabel: string;
  direction: TransactionDirection;
  amount: BigNumber;
  /** The remote side of the movement. Null when the node did not report one. */
  counterparty: string | null;
  /** Address Book name for `counterparty`, when we have one. */
  counterpartyLabel: string | null;
  /** Unix seconds. Null for pending blocks, which have no local_timestamp yet. */
  timestamp: number | null;
  status: TransactionStatus;
  height: number | null;
}

export interface TransactionFilter {
  direction: DirectionFilter;
  /** Raw text as typed; parsed leniently so a half-typed value never throws. */
  amountMin: string;
  amountMax: string;
  /** Matches address book labels, either address, or the block hash. */
  search: string;
  /** Null means every account. */
  accountId: string | null;
}

export const EMPTY_TRANSACTION_FILTER: TransactionFilter = {
  direction: 'all',
  amountMin: '',
  amountMax: '',
  search: '',
  accountId: null,
};

export function isFilterActive(filter: TransactionFilter): boolean {
  return (
    filter.direction !== 'all' ||
    filter.amountMin.trim() !== '' ||
    filter.amountMax.trim() !== '' ||
    filter.search.trim() !== '' ||
    !!filter.accountId
  );
}

/**
 * Parses a user-typed amount into raw units. Returns null for blank or
 * unparseable input so a typo narrows nothing rather than emptying the table.
 *
 * bignumber.js v5 throws on invalid input rather than yielding NaN, so this
 * has to guard explicitly: a half-typed amount is normal while editing and must
 * never take the page down.
 */
export function parseFilterAmount(value: string): BigNumber | null {
  const trimmed = (value ?? '').trim();
  if (trimmed === '') return null;
  try {
    const parsed = new BigNumber(trimmed);
    return parsed.isFinite() ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Case-insensitive substring match across every field a person might remember.
 *
 * Deliberately matches both the label and the raw address: asking "what did I
 * pay to Alice" has to work when only the address book knows the name Alice,
 * and "what did I pay to nano_abc" has to work when no label exists.
 */
function matchesSearch(transaction: WalletTransaction, needle: string): boolean {
  const haystack = [
    transaction.hash,
    transaction.accountId,
    transaction.accountLabel,
    transaction.counterparty ?? '',
    transaction.counterpartyLabel ?? '',
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(needle);
}

/**
 * Applies every filter conjunctively. Pure so it can be unit tested without a
 * component, and so the table and any summary counts cannot disagree.
 */
export function filterTransactions(
  transactions: ReadonlyArray<WalletTransaction>,
  filter: TransactionFilter,
): WalletTransaction[] {
  const needle = filter.search.trim().toLowerCase();
  const min = parseFilterAmount(filter.amountMin);
  const max = parseFilterAmount(filter.amountMax);

  return transactions.filter(transaction => {
    if (filter.direction !== 'all' && transaction.direction !== filter.direction) {
      return false;
    }
    if (filter.accountId && transaction.accountId !== filter.accountId) {
      return false;
    }
    if (min !== null && transaction.amount.lessThan(min)) {
      return false;
    }
    if (max !== null && transaction.amount.greaterThan(max)) {
      return false;
    }
    if (needle && !matchesSearch(transaction, needle)) {
      return false;
    }
    return true;
  });
}

/** Newest first, with undated pending blocks kept above dated history. */
export function sortTransactions(
  transactions: ReadonlyArray<WalletTransaction>,
): WalletTransaction[] {
  return [...transactions].sort((a, b) => {
    // Pending has no timestamp yet; treat it as newest so an incoming payment
    // awaiting a receive block stays at the top of a fresh page.
    if (a.timestamp === null && b.timestamp === null) return 0;
    if (a.timestamp === null) return -1;
    if (b.timestamp === null) return 1;
    return b.timestamp - a.timestamp;
  });
}