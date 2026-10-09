import { Injectable, inject } from '@angular/core';
import BigNumber from 'bignumber.js';
import { ApiService } from './api.service';
import { AddressBookService } from './address-book.service';
import { WalletTransaction, sortTransactions } from '../models/transaction.model';

/** Per the wallet survey, most people run a handful of accounts; 25 each is plenty. */
export const HISTORY_PER_ACCOUNT = 25;

const DB_NAME = 'naultcore-transaction-history';
const DB_VERSION = 1;
const STORE = 'history';

/** IndexedDB is an optimisation only; never let it gate the page. */
const DB_OPEN_TIMEOUT_MS = 2000;

interface CachedAccountHistory {
  accountId: string;
  /** Raw `account_history` rows, already reduced to what we store. */
  rows: StoredRow[];
}

interface StoredRow {
  hash: string;
  subtype: string;
  amount: string;
  account: string | null;
  link_as_account: string | null;
  local_timestamp: string | null;
  height: string | null;
}

/** bignumber.js v5 throws on unparseable input; a node value must not do that. */
function toRawAmount(value: unknown): BigNumber {
  try {
    return new BigNumber(typeof value === 'string' ? value : String(value ?? 0)).abs();
  } catch {
    return new BigNumber(0);
  }
}

/**
 * Transaction history with an IndexedDB cache and in-flight request coalescing.
 *
 * Two properties of Nano make aggressive caching correct rather than merely
 * convenient: a confirmed block is immutable, and `account_history` is
 * append-only for a given account. So a row already held for an account can
 * never change, and re-fetching it only ever burns an RPC round trip.
 */
@Injectable()
export class TransactionHistoryService {
  private readonly api = inject(ApiService);
  private readonly addressBook = inject(AddressBookService);

  /** accountId -> in-flight promise, so N callers cause one request. */
  private readonly inFlight = new Map<string, Promise<StoredRow[]>>();
  /** Per-account memory mirror, so repeat views skip IndexedDB entirely. */
  private readonly memory = new Map<string, StoredRow[]>();
  private dbPromise: Promise<IDBDatabase | null> | null = null;
  private dbUnavailable = false;

  /** Rows currently held per account, merged newest-first. */
  async rowsFor(accountId: string): Promise<StoredRow[]> {
    if (!accountId) return [];

    // The node call is started before the cache read and awaited on its own, so
    // a slow or wedged IndexedDB can delay the cached rows but can never
    // prevent the request from being made. Awaiting the cache first would let
    // IDB availability decide whether history loads at all.
    const pending = this.fetchRows(accountId);
    const cachedRows = this.readCache(accountId);

    try {
      const fresh = await pending;
      const cached = await cachedRows;
      // Deduped because a freshly fetched row is usually already in the cache;
      // concatenating would otherwise list the same block twice.
      return sortRows(dedupeByHash([...fresh, ...cached]));
    } catch {
      // Offline or the node is rate limiting us. Cached history is still worth
      // showing; a history table that empties on a flaky connection is useless.
      return sortRows(dedupeByHash(await cachedRows));
    }
  }

  /** Resolves history for many accounts with one request each, not one each. */
  async rowsForAccounts(accountIds: ReadonlyArray<string>): Promise<Map<string, StoredRow[]>> {
    const unique = Array.from(new Set(accountIds.filter(Boolean)));
    const results = await Promise.all(
      unique.map(async id => [id, await this.rowsFor(id)] as const),
    );
    return new Map(results);
  }

  /** Normalizes stored rows plus pending blocks into one table-ready list. */
  toTransactions(
    rows: ReadonlyArray<StoredRow>,
    accountId: string,
    accountLabel: string,
    pendingBlocks: ReadonlyArray<{ hash: string; account: string; amount: string; source: string }> = [],
  ): WalletTransaction[] {
    const label = (id: string | null): string | null => {
      if (!id) return null;
      const name = this.addressBook.getAccountName(id);
      return name && name !== id ? name : null;
    };

    const confirmed: WalletTransaction[] = rows.map(row => {
      const isSend = row.subtype === 'send';
      // For a send the node reports the recipient as link_as_account; for a
      // receive the counterparty is the block it linked to.
      const counterparty = row.link_as_account ?? row.account;
      return {
        hash: row.hash,
        accountId,
        accountLabel,
        direction: isSend ? 'sent' : 'received',
        amount: toRawAmount(row.amount),
        counterparty: counterparty && counterparty !== accountId ? counterparty : null,
        counterpartyLabel: label(counterparty),
        timestamp: row.local_timestamp ? Number(row.local_timestamp) : null,
        status: 'confirmed',
        height: row.height ? Number(row.height) : null,
      };
    });

    // Pending receivables are real incoming value that has not been claimed
    // yet. They belong in the same table so a payment cannot look lost.
    const pending: WalletTransaction[] = pendingBlocks
      .filter(block => block.account === accountId)
      .map(block => ({
        hash: block.hash,
        accountId,
        accountLabel,
        direction: 'received' as const,
        amount: toRawAmount(block.amount),
        counterparty: block.source && block.source !== accountId ? block.source : null,
        counterpartyLabel: label(block.source),
        timestamp: null,
        status: 'pending' as const,
        height: null,
      }));

    // A block that is pending here may already be confirmed in a row we hold.
    const confirmedHashes = new Set(confirmed.map(t => t.hash));
    return sortTransactions([
      ...pending.filter(t => !confirmedHashes.has(t.hash)),
      ...confirmed,
    ]);
  }

  private async fetchRows(accountId: string): Promise<StoredRow[]> {
    const existing = this.inFlight.get(accountId);
    if (existing) return existing;

    const request = (async () => {
      const response = await this.api.accountHistory(accountId, HISTORY_PER_ACCOUNT, true);
      const history = Array.isArray(response?.history) ? response.history : [];
      const rows = history.map((entry: any): StoredRow => ({
        hash: entry.hash ?? '',
        subtype: entry.subtype ?? entry.type ?? 'send',
        amount: String(entry.amount ?? 0),
        account: entry.account ?? null,
        link_as_account: entry.link_as_account ?? null,
        local_timestamp: entry.local_timestamp ? String(entry.local_timestamp) : null,
        height: entry.height != null ? String(entry.height) : null,
      })).filter(row => !!row.hash);

      await this.writeCache(accountId, rows);
      return rows;
    })().finally(() => this.inFlight.delete(accountId));

    this.inFlight.set(accountId, request);
    return request;
  }

  // --- Cache -------------------------------------------------------------

  private async readCache(accountId: string): Promise<StoredRow[]> {
    const inMemory = this.memory.get(accountId);
    if (inMemory) return inMemory;

    const db = await this.openDb();
    if (!db) return [];

    try {
      const record = await new Promise<CachedAccountHistory | undefined>((resolve, reject) => {
        const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(accountId);
        request.onsuccess = () => resolve(request.result as CachedAccountHistory | undefined);
        request.onerror = () => reject(request.error);
      });
      const rows = record?.rows ?? [];
      this.memory.set(accountId, rows);
      return rows;
    } catch {
      return [];
    }
  }

  private async writeCache(accountId: string, rows: StoredRow[]): Promise<void> {
    // Confirmed rows never change, so the cache holds the union of everything
    // ever seen for this account, not just the latest page.
    const merged = sortRows(dedupeByHash([...rows, ...(this.memory.get(accountId) ?? [])]));
    this.memory.set(accountId, merged);

    const db = await this.openDb();
    if (!db) return;

    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put({ accountId, rows: merged } satisfies CachedAccountHistory);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      // A full or unavailable database must never break the page.
    }
  }

  private async openDb(): Promise<IDBDatabase | null> {
    if (this.dbUnavailable) return null;
    if (this.dbPromise) return this.dbPromise;

    // A cache is an optimisation. If IndexedDB is slow, blocked, or broken in
    // an embedded webview, give up on it rather than let it gate the page.
    const guard = new Promise<IDBDatabase | null>(resolve =>
      setTimeout(() => {
        this.dbUnavailable = true;
        resolve(null);
      }, DB_OPEN_TIMEOUT_MS),
    );

    this.dbPromise = Promise.race([guard, this.openDbUnguarded()]);

    return this.dbPromise;
  }

  private openDbUnguarded(): Promise<IDBDatabase | null> {
    return new Promise<IDBDatabase | null>(resolve => {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }
      let request: IDBOpenDBRequest;
      try {
        request = indexedDB.open(DB_NAME, DB_VERSION);
      } catch {
        resolve(null);
        return;
      }
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'accountId' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        // Private browsing and some embedded webviews refuse IndexedDB.
        this.dbUnavailable = true;
        resolve(null);
      };
      request.onblocked = () => resolve(null);
    });
  }
}

function dedupeByHash(rows: ReadonlyArray<StoredRow>): StoredRow[] {
  const seen = new Set<string>();
  const out: StoredRow[] = [];
  for (const row of rows) {
    if (row.hash && !seen.has(row.hash)) {
      seen.add(row.hash);
      out.push(row);
    }
  }
  return out;
}

function sortRows(rows: ReadonlyArray<StoredRow>): StoredRow[] {
  return [...rows].sort((a, b) => {
    const aTime = a.local_timestamp ? Number(a.local_timestamp) : 0;
    const bTime = b.local_timestamp ? Number(b.local_timestamp) : 0;
    if (aTime === bTime) return 0;
    return bTime - aTime;
  });
}