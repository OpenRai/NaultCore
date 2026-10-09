import BigNumber from 'bignumber.js';
import {
  EMPTY_TRANSACTION_FILTER,
  TransactionFilter,
  WalletTransaction,
  filterTransactions,
  isFilterActive,
  parseFilterAmount,
  sortTransactions,
} from './transaction.model';

function tx(overrides: Partial<WalletTransaction> = {}): WalletTransaction {
  return {
    hash: 'ABC123',
    accountId: 'nano_mine1',
    accountLabel: 'Primary',
    direction: 'received',
    amount: new BigNumber(10),
    counterparty: 'nano_theirs1',
    counterpartyLabel: null,
    timestamp: 1_600_000_000,
    status: 'confirmed',
    height: 100,
    ...overrides,
  };
}

function filter(overrides: Partial<TransactionFilter> = {}): TransactionFilter {
  return { ...EMPTY_TRANSACTION_FILTER, ...overrides };
}

describe('transaction model', () => {
  describe('parseFilterAmount', () => {
    it('treats blank input as absent', () => {
      expect(parseFilterAmount('')).toBeNull();
      expect(parseFilterAmount('   ')).toBeNull();
    });

    it('parses a numeric value', () => {
      expect(parseFilterAmount('5').toNumber()).toBe(5);
      expect(parseFilterAmount('0.5').toNumber()).toBe(0.5);
    });

    it('returns null for unparseable text rather than throwing', () => {
      expect(parseFilterAmount('abc')).toBeNull();
      expect(parseFilterAmount('1,5x')).toBeNull();
    });
  });

  describe('isFilterActive', () => {
    it('is false for an untouched filter', () => {
      expect(isFilterActive(filter())).toBe(false);
    });

    it('is true once any field is set', () => {
      expect(isFilterActive(filter({ direction: 'sent' }))).toBe(true);
      expect(isFilterActive(filter({ search: 'a' }))).toBe(true);
      expect(isFilterActive(filter({ amountMin: '1' }))).toBe(true);
      expect(isFilterActive(filter({ amountMax: '1' }))).toBe(true);
      expect(isFilterActive(filter({ accountId: 'nano_x' }))).toBe(true);
    });

    it('ignores whitespace-only text', () => {
      expect(isFilterActive(filter({ search: '   ' }))).toBe(false);
    });
  });

  describe('filterTransactions', () => {
    const rows = [
      tx({ hash: 'h1', direction: 'sent', amount: new BigNumber(5), counterparty: 'nano_alice', counterpartyLabel: 'Alice' }),
      tx({ hash: 'h2', direction: 'received', amount: new BigNumber(50), counterparty: 'nano_bob', counterpartyLabel: null }),
      tx({ hash: 'h3', direction: 'sent', amount: new BigNumber(500), counterparty: null, counterpartyLabel: null }),
    ];

    it('returns everything when unfiltered', () => {
      expect(filterTransactions(rows, filter())).toHaveLength(3);
    });

    it('filters by direction', () => {
      const sent = filterTransactions(rows, filter({ direction: 'sent' }));
      expect(sent.map(r => r.hash)).toEqual(['h1', 'h3']);
    });

    it('filters by amount range', () => {
      const ranged = filterTransactions(rows, filter({ amountMin: '10', amountMax: '100' }));
      expect(ranged.map(r => r.hash)).toEqual(['h2']);
    });

    it('includes boundary values in the amount range', () => {
      expect(filterTransactions(rows, filter({ amountMin: '50' })).map(r => r.hash)).toEqual(['h2', 'h3']);
      expect(filterTransactions(rows, filter({ amountMax: '50' })).map(r => r.hash)).toEqual(['h1', 'h2']);
    });

    it('searches the address book label', () => {
      const found = filterTransactions(rows, filter({ search: 'alice' }));
      expect(found.map(r => r.hash)).toEqual(['h1']);
    });

    it('searches a raw counterparty address when no label exists', () => {
      const found = filterTransactions(rows, filter({ search: 'nano_bob' }));
      expect(found.map(r => r.hash)).toEqual(['h2']);
    });

    it('searches case-insensitively', () => {
      expect(filterTransactions(rows, filter({ search: 'NANO_ALICE' })).map(r => r.hash)).toEqual(['h1']);
    });

    it('searches the block hash', () => {
      expect(filterTransactions(rows, filter({ search: 'h3' })).map(r => r.hash)).toEqual(['h3']);
    });

    it('searches the local account label', () => {
      expect(filterTransactions(rows, filter({ search: 'Primary' }))).toHaveLength(3);
    });

    it('narrows nothing when the search is only whitespace', () => {
      expect(filterTransactions(rows, filter({ search: '   ' }))).toHaveLength(3);
    });

    it('narrows nothing when the amount is unparseable', () => {
      expect(filterTransactions(rows, filter({ amountMin: 'abc' }))).toHaveLength(3);
    });

    it('filters by local account', () => {
      const mixed = [...rows, tx({ hash: 'h4', accountId: 'nano_other', accountLabel: 'Savings' })];
      expect(filterTransactions(mixed, filter({ accountId: 'nano_other' })).map(r => r.hash)).toEqual(['h4']);
    });

    it('combines filters conjunctively', () => {
      const found = filterTransactions(rows, filter({ direction: 'sent', amountMax: '100', search: 'alice' }));
      expect(found.map(r => r.hash)).toEqual(['h1']);
    });

    it('can return nothing when filters conflict', () => {
      expect(filterTransactions(rows, filter({ direction: 'sent', search: 'bob' }))).toHaveLength(0);
    });
  });

  describe('sortTransactions', () => {
    it('puts the newest first', () => {
      const sorted = sortTransactions([
        tx({ hash: 'old', timestamp: 100 }),
        tx({ hash: 'new', timestamp: 300 }),
        tx({ hash: 'mid', timestamp: 200 }),
      ]);
      expect(sorted.map(t => t.hash)).toEqual(['new', 'mid', 'old']);
    });

    it('keeps undated pending rows above dated history', () => {
      const sorted = sortTransactions([
        tx({ hash: 'old', timestamp: 100 }),
        tx({ hash: 'pending', timestamp: null, status: 'pending' }),
      ]);
      expect(sorted.map(t => t.hash)).toEqual(['pending', 'old']);
    });

    it('does not mutate the input', () => {
      const input = [tx({ hash: 'a', timestamp: 1 }), tx({ hash: 'b', timestamp: 2 })];
      sortTransactions(input);
      expect(input.map(t => t.hash)).toEqual(['a', 'b']);
    });
  });
});