import { TestBed } from '@angular/core/testing';
import BigNumber from 'bignumber.js';
import { AddressBookService } from './address-book.service';
import { ApiService } from './api.service';
import { HISTORY_PER_ACCOUNT, TransactionHistoryService } from './transaction-history.service';

class MockApiService {
  accountHistory = vi.fn().mockResolvedValue({ history: [] });
}

class MockAddressBookService {
  names: Record<string, string> = {};
  getAccountName = vi.fn((id: string) => this.names[id] ?? null);
}

describe('TransactionHistoryService', () => {
  let service: TransactionHistoryService;
  let api: MockApiService;
  let addressBook: MockAddressBookService;

  const ACCOUNT = 'nano_mine1';

  beforeEach(() => {
    api = new MockApiService();
    addressBook = new MockAddressBookService();

    TestBed.configureTestingModule({
      providers: [
        TransactionHistoryService,
        { provide: ApiService, useValue: api },
        { provide: AddressBookService, useValue: addressBook },
      ],
    });

    service = TestBed.inject(TransactionHistoryService);
  });

  const row = (over: Record<string, unknown> = {}) => ({
    hash: 'h1',
    subtype: 'send',
    amount: '1000000',
    account: 'nano_theirs',
    link_as_account: 'nano_theirs',
    local_timestamp: '1600000000',
    height: '100',
    ...over,
  });

  describe('fetching', () => {
    it('requests the agreed per-account depth', async () => {
      await service.rowsFor(ACCOUNT);
      expect(api.accountHistory).toHaveBeenCalledWith(ACCOUNT, HISTORY_PER_ACCOUNT, true);
    });

    it('coalesces concurrent requests for the same account into one call', async () => {
      api.accountHistory.mockResolvedValue({ history: [row()] });

      await Promise.all([service.rowsFor(ACCOUNT), service.rowsFor(ACCOUNT), service.rowsFor(ACCOUNT)]);

      expect(api.accountHistory).toHaveBeenCalledTimes(1);
    });

    it('still issues one call per distinct account', async () => {
      api.accountHistory.mockResolvedValue({ history: [row()] });

      await service.rowsForAccounts([ACCOUNT, 'nano_other']);

      expect(api.accountHistory).toHaveBeenCalledTimes(2);
    });

    it('deduplicates the account list before requesting', async () => {
      api.accountHistory.mockResolvedValue({ history: [] });

      await service.rowsForAccounts([ACCOUNT, ACCOUNT, ACCOUNT]);

      expect(api.accountHistory).toHaveBeenCalledTimes(1);
    });

    it('returns nothing for a blank account id without calling the node', async () => {
      expect(await service.rowsFor('')).toEqual([]);
      expect(api.accountHistory).not.toHaveBeenCalled();
    });

    it('survives a node failure', async () => {
      api.accountHistory.mockRejectedValue(new Error('rate limited'));
      await expect(service.rowsFor(ACCOUNT)).resolves.toEqual([]);
    });
  });

  describe('normalization', () => {
    it('maps a send row to a sent transaction with its recipient', async () => {
      api.accountHistory.mockResolvedValue({
        history: [row({ subtype: 'send', link_as_account: 'nano_dest' })],
      });

      const rows = await service.rowsFor(ACCOUNT);
      const [tx] = service.toTransactions(rows, ACCOUNT, 'Primary');

      expect(tx.direction).toBe('sent');
      expect(tx.counterparty).toBe('nano_dest');
      expect(tx.accountLabel).toBe('Primary');
      expect(tx.status).toBe('confirmed');
      expect(tx.amount.toNumber()).toBe(1000000);
    });

    it('maps a receive row to a received transaction', async () => {
      api.accountHistory.mockResolvedValue({
        history: [row({ subtype: 'receive', account: ACCOUNT, link_as_account: 'nano_sender', link: 'source-send-hash' })],
      });

      const rows = await service.rowsFor(ACCOUNT);
      const [tx] = service.toTransactions(rows, ACCOUNT, 'Primary');

      expect(tx.direction).toBe('received');
      expect(tx.counterparty).toBe('nano_sender');
      expect(tx.sourceHash).toBe('source-send-hash');
    });

    it('attaches the address book label for the counterparty when known', async () => {
      addressBook.names['nano_dest'] = 'Alice';
      api.accountHistory.mockResolvedValue({
        history: [row({ link_as_account: 'nano_dest' })],
      });

      const rows = await service.rowsFor(ACCOUNT);
      const [tx] = service.toTransactions(rows, ACCOUNT, 'Primary');

      expect(tx.counterpartyLabel).toBe('Alice');
    });

    it('leaves the counterparty null when it is the account itself', async () => {
      api.accountHistory.mockResolvedValue({
        history: [row({ link_as_account: ACCOUNT, account: ACCOUNT })],
      });

      const rows = await service.rowsFor(ACCOUNT);
      const [tx] = service.toTransactions(rows, ACCOUNT, 'Primary');

      expect(tx.counterparty).toBeNull();
    });

    it('drops rows with no hash rather than rendering a broken link', async () => {
      api.accountHistory.mockResolvedValue({ history: [{ amount: '5' }, row()] });
      const rows = await service.rowsFor(ACCOUNT);
      expect(rows).toHaveLength(1);
    });
  });

  describe('pending blocks', () => {
    it('folds a pending receive into the same list', () => {
      const [tx] = service.toTransactions([], ACCOUNT, 'Primary', [
        { hash: 'pend1', account: ACCOUNT, amount: '5000000', source: 'nano_sender' },
      ]);

      expect(tx.status).toBe('pending');
      expect(tx.direction).toBe('received');
      expect(tx.timestamp).toBeNull();
      expect(tx.counterparty).toBe('nano_sender');
      expect(tx.sourceHash).toBe('pend1');
    });

    it('ignores pending blocks belonging to another account', () => {
      const list = service.toTransactions([], ACCOUNT, 'Primary', [
        { hash: 'pend1', account: 'nano_other', amount: '5000000', source: 'nano_sender' },
      ]);
      expect(list).toHaveLength(0);
    });

    it('does not duplicate a block that is both pending and confirmed', () => {
      api.accountHistory.mockResolvedValue({ history: [row({ hash: 'pend1', subtype: 'receive' })] });

      return service.rowsFor(ACCOUNT).then(rows => {
        const list = service.toTransactions(rows, ACCOUNT, 'Primary', [
          { hash: 'pend1', account: ACCOUNT, amount: '1000000', source: 'nano_sender' },
        ]);
        expect(list).toHaveLength(1);
        expect(list[0].status).toBe('confirmed');
      });
    });
  });

  describe('caching', () => {
    it('reuses cached rows across separate loads of the same account', async () => {
      api.accountHistory.mockResolvedValue({ history: [row()] });

      const first = await service.rowsFor(ACCOUNT);
      const second = await service.rowsFor(ACCOUNT);

      expect(first.map(r => r.hash)).toEqual(second.map(r => r.hash));
      // The memory mirror means the second read needs no IndexedDB round trip.
      expect(second.some(r => r.hash === 'h1')).toBe(true);
    });

    it('merges previously seen rows with newer ones', async () => {
      api.accountHistory.mockResolvedValueOnce({ history: [row({ hash: 'older' })] });
      await service.rowsFor(ACCOUNT);

      api.accountHistory.mockResolvedValueOnce({
        history: [row({ hash: 'newer', local_timestamp: '1700000000' })],
      });
      const merged = await service.rowsFor(ACCOUNT);

      // A confirmed block cannot be un-confirmed, so the union is retained.
      expect(merged.map(r => r.hash).sort()).toEqual(['newer', 'older']);
    });

    it('keeps rows newest first', async () => {
      api.accountHistory.mockResolvedValue({
        history: [
          row({ hash: 'a', local_timestamp: '100' }),
          row({ hash: 'b', local_timestamp: '300' }),
          row({ hash: 'c', local_timestamp: '200' }),
        ],
      });

      const rows = await service.rowsFor(ACCOUNT);
      expect(rows.map(r => r.hash)).toEqual(['b', 'c', 'a']);
    });
  });
});
