import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { workDifficultyToThreshold } from '@openrai/nano-core';
import { ApiService } from './api.service';
import { UtilService } from './util.service';
import PowWorker from 'worker-loader!../../assets/lib/rspow.worker.js';

export interface StoredWorkEntry {
  account: string | null;
  root: string;
  work: string;
  threshold: string;
  createdAt: number;
}

export interface WorkAccountDemand {
  account: string;
  root: string;
  multiplier: number;
  priority?: number;
}

export interface WorkPoolState {
  ready: number;
  queued: number;
  activeRoot: string | null;
  activeAccount: string | null;
  activeElapsedMs: number;
  lastError: string | null;
  phase: 'idle' | 'local' | 'remote';
}

interface WorkRequest {
  account: string | null;
  root: string;
  multiplier: number;
  priority: number;
  resolve: (work: string) => void;
  reject: (error: Error) => void;
}

interface PersistedWorkCache {
  version: 2;
  entries: StoredWorkEntry[];
}

@Injectable()
export class WorkPoolService {
  readonly storeKey = 'nanovault-workcache';
  readonly cacheLength = 25;
  readonly state$ = new BehaviorSubject<WorkPoolState>({
    ready: 0,
    queued: 0,
    activeRoot: null,
    activeAccount: null,
    activeElapsedMs: 0,
    lastError: null,
    phase: 'idle',
  });

  // Existing callers still see this property, but entries are now account/root scoped.
  workCache: StoredWorkEntry[] = [];

  private requests: WorkRequest[] = [];
  private inFlight = new Map<string, Promise<string>>();
  private accountRoots = new Map<string, string>();
  private worker: Worker | null = null;
  private workerRequestId = 0;
  private activeStartedAt = 0;
  private activeRequest: WorkRequest | null = null;
  private loaded = false;
  private stateTimer: ReturnType<typeof setInterval> | null = null;
  private slowTimer: ReturnType<typeof setTimeout> | null = null;
  private remoteRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private remoteRetryAttempt = 0;
  private remoteFallbackStarted = false;

  constructor(
    private api: ApiService,
    private util: UtilService,
  ) { }

  public loadWorkCache(): StoredWorkEntry[] {
    this.loaded = true;
    try {
      const raw = localStorage.getItem(this.storeKey);
      if (!raw) return this.workCache;
      const parsed = JSON.parse(raw) as PersistedWorkCache | Array<{hash: string; work: string}>;
      if (Array.isArray(parsed)) {
        // Legacy entries have no account identity and remain transient until matched.
        this.workCache = parsed
          .filter(entry => typeof entry.hash === 'string' && typeof entry.work === 'string')
          .map(entry => ({
            account: null,
            root: entry.hash.toUpperCase(),
            work: entry.work.toUpperCase(),
            threshold: workDifficultyToThreshold('send'),
            createdAt: Date.now(),
          }));
      } else if (parsed?.version === 2 && Array.isArray(parsed.entries)) {
        this.workCache = parsed.entries.filter(entry => this.isEntryShape(entry)).map(entry => ({
          ...entry,
          root: entry.root.toUpperCase(),
          work: entry.work.toUpperCase(),
          threshold: entry.threshold.toUpperCase(),
        }));
      }
      this.persist();
    } catch (error) {
      console.warn('[WorkPool] Ignoring invalid persisted work cache', error);
      this.workCache = [];
    }
    this.publishState();
    return this.workCache;
  }

  /** Reconciles durable work with the node's current account frontiers. */
  public syncAccountRoots(demands: WorkAccountDemand[]): void {
    this.loaded = true;
    this.accountRoots = new Map(demands.map(demand => [demand.account, demand.root.toUpperCase()]));
    const validAccounts = new Set(this.accountRoots.keys());
    this.requests = this.requests.filter(request => {
      const expectedRoot = request.account ? this.accountRoots.get(request.account) : undefined;
      if (request.account && (!expectedRoot || expectedRoot !== request.root)) {
        request.reject(new Error('PoW request invalidated by frontier change'));
        return false;
      }
      return true;
    });
    if (this.activeRequest?.account) {
      const expectedRoot = this.accountRoots.get(this.activeRequest.account);
      if (!expectedRoot || expectedRoot !== this.activeRequest.root) {
        this.removeFromCache(this.activeRequest.root, this.activeRequest.account);
      }
    }
    this.workCache = this.workCache.filter(entry => {
      if (!entry.account) return true;
      return validAccounts.has(entry.account) && this.accountRoots.get(entry.account) === entry.root;
    });
    this.persist();
    for (const demand of demands) {
      this.addWorkToCache(demand.root, demand.multiplier, demand.account, demand.priority ?? 0);
    }
    this.publishState();
  }

  public workExists(hash: string, multiplier = 1, account: string | null = null): boolean {
    return this.findValidEntry(hash.toUpperCase(), multiplier, account) !== null;
  }

  /** Starts precomputation without blocking the caller. */
  public addWorkToCache(hash: string, multiplier = 1, account: string | null = null, priority = 0): void {
    const root = hash.toUpperCase();
    if (this.findValidEntry(root, multiplier, account)) return;
    this.enqueue({
      account,
      root,
      multiplier,
      priority,
      resolve: () => undefined,
      reject: () => undefined,
    });
  }

  public removeFromCache(hash: string, account: string | null = null): void {
    const root = hash.toUpperCase();
    this.workCache = this.workCache.filter(entry =>
      entry.root !== root || (account !== null && entry.account !== account));
    this.persist();
    if (this.activeRequest?.root === root && (account === null || this.activeRequest.account === account)) {
      this.clearActiveTimers();
      this.worker?.terminate();
      this.worker = null;
      this.activeRequest.reject(new Error('PoW request invalidated by frontier change'));
      this.activeRequest = null;
      this.processNext();
    }
    this.publishState();
  }

  public clearCache(): boolean {
    this.cancelPendingRequests(new Error('PoW cache cleared'));
    this.workCache = [];
    this.persist();
    this.publishState();
    return true;
  }

  public deleteCache(): void {
    this.cancelPendingRequests(new Error('PoW cache deleted'));
    this.workCache = [];
    localStorage.removeItem(this.storeKey);
    this.publishState();
  }

  /** Returns matching durable work, waiting for the scheduler when needed. */
  public async getWork(hash: string, multiplier = 1, account: string | null = null): Promise<string> {
    const root = hash.toUpperCase();
    const cached = this.findValidEntry(root, multiplier, account);
    if (cached) return cached.work;

    const key = this.requestKey(root, multiplier, account);
    const existing = this.inFlight.get(key);
    if (existing) return existing;

    const promise = new Promise<string>((resolve, reject) => {
      this.enqueue({ account, root, multiplier, priority: 100, resolve, reject });
    });
    this.inFlight.set(key, promise);
    promise.finally(() => this.inFlight.delete(key)).catch(() => undefined);
    return promise;
  }

  private enqueue(request: WorkRequest): void {
    const duplicate = this.requests.some(item =>
      item.root === request.root && item.account === request.account && item.multiplier === request.multiplier);
    if (duplicate) return;
    this.requests.push(request);
    this.requests.sort((a, b) => b.priority - a.priority);
    this.ensureWorker();
    this.processNext();
    this.publishState();
  }

  private ensureWorker(): void {
    if (this.worker) return;
    this.worker = new PowWorker();
    this.worker.onmessage = event => this.onWorkerMessage(event.data);
    this.worker.onerror = event => {
      const error = new Error(event.message || 'PoW worker failed');
      const request = this.activeRequest;
      this.activeRequest = null;
      this.clearActiveTimers();
      this.worker?.terminate();
      this.worker = null;
      if (request) this.requests.unshift(request);
      this.state$.next({ ...this.state$.value, lastError: error.message });
      setTimeout(() => this.processNext(), 1000);
    };
  }

  private processNext(): void {
    if (this.activeRequest || this.requests.length === 0) return;
    const request = this.requests.shift()!;
    this.activeRequest = request;
    this.activeStartedAt = Date.now();
    this.state$.next({ ...this.state$.value, phase: 'local', lastError: null });
    this.remoteFallbackStarted = false;
    this.remoteRetryAttempt = 0;
    this.ensureStateTimer();
    const threshold = this.util.nano.difficultyFromMultiplier(
      request.multiplier,
      workDifficultyToThreshold('send'),
    );
    this.worker!.postMessage({ id: ++this.workerRequestId, root: request.root, threshold });
    this.slowTimer = setTimeout(() => this.startRemoteFallback(request, threshold), 15_000);
    this.publishState();
  }

  private onWorkerMessage(message: {id: number; ok: boolean; work?: string; error?: string}): void {
    const request = this.activeRequest;
    if (!request) return;
    this.clearActiveTimers();
    this.activeRequest = null;
    if (message.ok && message.work) {
      const threshold = this.util.nano.difficultyFromMultiplier(
        request.multiplier,
        workDifficultyToThreshold('send'),
      );
      const entry: StoredWorkEntry = {
        account: request.account,
        root: request.root,
        work: message.work.toUpperCase(),
        threshold,
        createdAt: Date.now(),
      };
      this.workCache = this.workCache.filter(item => !(item.account === entry.account && item.root === entry.root));
      this.workCache.push(entry);
      if (this.workCache.length > this.cacheLength) {
        this.workCache.sort((a, b) => b.createdAt - a.createdAt);
        this.workCache.length = this.cacheLength;
      }
      this.persist();
      request.resolve(entry.work);
    } else {
      const error = new Error(message.error || 'PoW generation failed');
      this.state$.next({ ...this.state$.value, lastError: error.message });
      request.reject(error);
    }
    this.publishState();
    this.processNext();
  }

  private startRemoteFallback(request: WorkRequest, threshold: string): void {
    if (this.activeRequest !== request || this.remoteFallbackStarted) return;
    this.remoteFallbackStarted = true;
    this.remoteRetryAttempt = 0;
    this.state$.next({ ...this.state$.value, phase: 'remote', lastError: 'Local PoW is taking longer than expected; retrying through the network' });
    this.tryRemoteWork(request, threshold);
  }

  private async tryRemoteWork(request: WorkRequest, threshold: string): Promise<void> {
    if (this.activeRequest !== request) return;
    try {
      const response = await this.api.workGenerateOnce(request.root, threshold);
      const work = response?.work?.toUpperCase();
      if (work && this.util.nano.validateWork(request.root, threshold, work)) {
        this.clearActiveTimers();
        this.worker?.terminate();
        this.worker = null;
        this.onWorkerMessage({ id: this.workerRequestId, ok: true, work });
        return;
      }
      throw new Error('Remote PoW response failed validation');
    } catch (error) {
      if (this.activeRequest !== request) return;
      this.remoteRetryAttempt += 1;
      const delay = Math.min(30_000, 1_000 * 2 ** Math.min(this.remoteRetryAttempt - 1, 5));
      this.state$.next({ ...this.state$.value, lastError: error instanceof Error ? error.message : String(error) });
      this.remoteRetryTimer = setTimeout(() => this.tryRemoteWork(request, threshold), delay);
    }
  }

  private clearActiveTimers(): void {
    if (this.slowTimer) clearTimeout(this.slowTimer);
    if (this.remoteRetryTimer) clearTimeout(this.remoteRetryTimer);
    this.slowTimer = null;
    this.remoteRetryTimer = null;
  }

  private cancelPendingRequests(error: Error): void {
    for (const request of this.requests) request.reject(error);
    this.requests = [];
    if (this.activeRequest) {
      this.activeRequest.reject(error);
      this.activeRequest = null;
    }
    this.clearActiveTimers();
    this.worker?.terminate();
    this.worker = null;
  }

  private findValidEntry(root: string, multiplier: number, account: string | null): StoredWorkEntry | null {
    const threshold = this.util.nano.difficultyFromMultiplier(multiplier, workDifficultyToThreshold('send'));
    const matches = this.workCache.filter(entry =>
      entry.root === root && (account === null || entry.account === account));
    for (const entry of matches) {
      try {
        if (this.util.nano.validateWork(root, threshold, entry.work)) return entry;
      } catch {
        // Remove invalid persisted work below.
      }
    }
    if (matches.length > 0) {
      this.workCache = this.workCache.filter(entry => !matches.includes(entry));
      this.persist();
    }
    return null;
  }

  private requestKey(root: string, multiplier: number, account: string | null): string {
    return `${account || '*'}:${root}:${multiplier}`;
  }

  private isEntryShape(entry: StoredWorkEntry): boolean {
    return !!entry && (entry.account === null || typeof entry.account === 'string') &&
      typeof entry.root === 'string' && typeof entry.work === 'string' &&
      typeof entry.threshold === 'string' && typeof entry.createdAt === 'number';
  }

  private persist(): void {
    if (!this.loaded) return;
    const cache: PersistedWorkCache = { version: 2, entries: this.workCache };
    localStorage.setItem(this.storeKey, JSON.stringify(cache));
  }

  private ensureStateTimer(): void {
    if (this.stateTimer) return;
    this.stateTimer = setInterval(() => this.publishState(), 1000);
  }

  private publishState(): void {
    if (!this.activeRequest && this.stateTimer) {
      clearInterval(this.stateTimer);
      this.stateTimer = null;
    }
    this.state$.next({
      ready: this.workCache.length,
      queued: this.requests.length,
      activeRoot: this.activeRequest?.root || null,
      activeAccount: this.activeRequest?.account || null,
      activeElapsedMs: this.activeRequest ? Date.now() - this.activeStartedAt : 0,
      lastError: this.state$.value.lastError,
      phase: this.activeRequest ? this.state$.value.phase : 'idle',
    });
  }
}
