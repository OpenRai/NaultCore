import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { workDifficultyToThreshold } from '@openrai/nano-core';
import { ApiService } from './api.service';
import { UtilService } from './util.service';
import { AppSettingsService } from './app-settings.service';
import { PowRoute, PowRoutingService } from './pow-routing.service';

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
  purpose?: WorkPurpose;
}

export type WorkPurpose = 'frontier' | 'receive-open';

export interface WorkAccountStatus {
  account: string;
  root: string;
  purpose: WorkPurpose;
  activity: 'idle' | 'active' | 'success' | 'error';
  phase: 'idle' | 'local' | 'remote';
  active: boolean;
  queued: boolean;
  cached: boolean;
  activeElapsedMs: number;
  lastError: string | null;
}

export interface WorkPoolState {
  ready: number;
  queued: number;
  activeRoot: string | null;
  activeAccount: string | null;
  activeElapsedMs: number;
  lastError: string | null;
  phase: 'idle' | 'local' | 'remote';
  activeTier: 'send' | 'receive' | null;
  receiveHints: number;
}

interface WorkRequest {
  id: number;
  account: string | null;
  root: string;
  multiplier: number;
  priority: number;
  tier: 'send' | 'receive';
  hinted: boolean;
  hintConsumed: boolean;
  resolve: (work: string) => void;
  reject: (error: Error) => void;
}

interface ReceiveWorkHint {
  account: string;
  root: string;
  expiresAt: number;
}

interface PersistedWorkCache {
  version: 2;
  entries: StoredWorkEntry[];
}

@Injectable()
export class WorkPoolService {
  private api = inject(ApiService);
  private util = inject(UtilService);
  private appSettings = inject(AppSettingsService);
  private powRouting = inject(PowRoutingService);

  readonly storeKey = 'nanovault-workcache';
  readonly cacheLength = 25;
  readonly slowWorkLimitMs = 60_000;
  readonly state$ = new BehaviorSubject<WorkPoolState>({
    ready: 0,
    queued: 0,
    activeRoot: null,
    activeAccount: null,
    activeElapsedMs: 0,
    lastError: null,
    phase: 'idle',
    activeTier: null,
    receiveHints: 0,
  });

  private readonly accountStatusSubject = new BehaviorSubject<ReadonlyMap<string, WorkAccountStatus>>(new Map());
  readonly accountStatus$ = this.accountStatusSubject.asObservable();

  // Existing callers still see this property, but entries are now account/root scoped.
  workCache: StoredWorkEntry[] = [];

  private requests: WorkRequest[] = [];
  private inFlight = new Map<string, Promise<string>>();
  private nextRequestId = 0;
  private accountRoots = new Map<string, string>();
  private accountPurposes = new Map<string, WorkPurpose>();
  // A sweeper may deliberately drain an account and know that its just-created
  // frontier will not be used. Keep this transient: a later frontier change
  // restores ordinary wallet preparation automatically.
  private suppressedPrecomputation = new Map<string, string>();
  private receiveHints = new Map<string, ReceiveWorkHint>();
  private worker: Worker | null = null;
  private workerRequestId = 0;
  private activeWorkerRequestId = 0;
  private activeStartedAt = 0;
  private activeRequest: WorkRequest | null = null;
  private loaded = false;
  private stateTimer: ReturnType<typeof setInterval> | null = null;
  private remoteRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private remoteRetryAttempt = 0;
  private readonly receiveHintTtlMs = 60_000;
  private lastCompleted: { account: string; root: string; expiresAt: number } | null = null;
  private completionTimer: ReturnType<typeof setTimeout> | null = null;
  private lastErrorAccount: string | null = null;
  private lastErrorRoot: string | null = null;

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
    this.accountPurposes = new Map(demands.map(demand => [demand.account, demand.purpose ?? 'frontier']));
    const validAccounts = new Set(this.accountRoots.keys());
    for (const [account, root] of this.suppressedPrecomputation) {
      if (!validAccounts.has(account) || this.accountRoots.get(account) !== root) {
        this.suppressedPrecomputation.delete(account);
      }
    }
    this.pruneReceiveHints();
    for (const [key, hint] of this.receiveHints) {
      if (!validAccounts.has(hint.account) || this.accountRoots.get(hint.account) !== hint.root) {
        this.receiveHints.delete(key);
      }
    }
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
    this.pruneWorkCache();
    this.persist();
    for (const demand of demands) {
      const purpose = demand.purpose ?? 'frontier';
      if (purpose === 'frontier' && this.suppressedPrecomputation.get(demand.account) === demand.root.toUpperCase()) {
        continue;
      }
      const multiplier = purpose === 'receive-open' ? Math.min(demand.multiplier, 1 / 64) : demand.multiplier;
      this.addWorkToCache(demand.root, multiplier, demand.account, demand.priority ?? 0);
    }
    this.publishState();
  }

  public workExists(hash: string, multiplier = 1, account: string | null = null): boolean {
    return this.findValidEntry(hash.toUpperCase(), multiplier, account) !== null;
  }

  /**
   * Prevents speculative next-block work for a frontier intentionally drained
   * by a sweep. Interactive requests still work, and a future frontier change
   * clears this short-lived suppression.
   */
  public suppressPrecomputation(account: string, hash: string): void {
    const root = hash.toUpperCase();
    this.suppressedPrecomputation.set(account, root);
    this.logWorkEvent('suppressed', root, 1, account);
    this.removeFromCache(root, account);
  }

  /**
   * Records a short-lived, one-shot indication that this frontier is likely to
   * be consumed by a receive block. The standing send-tier demand remains in
   * place; this only lets a cheaper job run first when no hard work is ready.
   */
  public noteReceiveExpected(account: string, hash: string): void {
    const root = hash.toUpperCase();
    const knownRoot = this.accountRoots.get(account);
    if (knownRoot && knownRoot !== root) return;
    if (this.workExists(root, 1, account)) return;

    this.receiveHints.set(this.receiveHintKey(account, root), {
      account,
      root,
      expiresAt: Date.now() + this.receiveHintTtlMs,
    });
    this.enqueue({
      id: ++this.nextRequestId,
      account,
      root,
      multiplier: 1 / 64,
      priority: 20,
      tier: 'receive',
      hinted: true,
      hintConsumed: false,
      resolve: () => undefined,
      reject: () => undefined,
    });
    this.publishState();
  }

  /** Removes an unused hint and stops only its lower-tier background work. */
  public revokeReceiveHint(account: string, hash?: string): void {
    const root = hash?.toUpperCase();
    for (const [key, hint] of this.receiveHints) {
      if (hint.account === account && (!root || hint.root === root)) {
        this.receiveHints.delete(key);
      }
    }
    this.requests = this.requests.filter(request =>
      !(request.hinted && request.account === account && (!root || request.root === root)));
    if (this.activeRequest?.hinted && this.activeRequest.account === account &&
        (!root || this.activeRequest.root === root)) {
      this.cancelActiveRequest(new Error('Receive work hint revoked'));
    }
    this.publishState();
  }

  /** Starts precomputation without blocking the caller. */
  public addWorkToCache(hash: string, multiplier = 1, account: string | null = null, priority = 0): void {
    const root = hash.toUpperCase();
    if (this.findValidEntry(root, multiplier, account)) return;
    this.enqueue({
      id: ++this.nextRequestId,
      account,
      root,
      multiplier,
      priority,
      tier: multiplier < 1 ? 'receive' : 'send',
      hinted: false,
      hintConsumed: false,
      resolve: () => undefined,
      reject: () => undefined,
    });
  }

  public removeFromCache(hash: string, account: string | null = null): void {
    const root = hash.toUpperCase();
    if (account) this.revokeReceiveHint(account, root);
    this.workCache = this.workCache.filter(entry =>
      entry.root !== root || (account !== null && entry.account !== account));
    this.persist();
    if (this.activeRequest?.root === root && (account === null || this.activeRequest.account === account)) {
      this.clearActiveTimers();
      this.worker?.terminate();
      this.worker = null;
      this.activeRequest.reject(new Error('PoW request invalidated by frontier change'));
      this.activeRequest = null;
      this.activeWorkerRequestId = 0;
      this.processNext();
    }
    this.publishState();
  }

  public clearCache(): boolean {
    this.cancelPendingRequests(new Error('PoW cache cleared'));
    this.workCache = [];
    this.receiveHints.clear();
    this.persist();
    this.publishState();
    return true;
  }

  /** Cancels active and queued work after an explicit user request. */
  public cancelAllWork(): boolean {
    if (!this.activeRequest && this.requests.length === 0) return false;
    this.cancelPendingRequests(new Error('Proof of Work generation cancelled by the user'));
    this.state$.next({ ...this.state$.value, lastError: null });
    this.publishState();
    return true;
  }

  public deleteCache(): void {
    this.cancelPendingRequests(new Error('PoW cache deleted'));
    this.workCache = [];
    this.receiveHints.clear();
    localStorage.removeItem(this.storeKey);
    this.publishState();
  }

  /**
   * Returns matching work, waiting for the scheduler when needed. Only explicit
   * user actions may preempt background receive and precomputation work.
   */
  public async getWork(hash: string, multiplier = 1, account: string | null = null, interactive = false): Promise<string> {
    const root = hash.toUpperCase();
    if (interactive && multiplier >= 1 && account) this.revokeReceiveHint(account, root);
    if (multiplier < 1 && account) this.receiveHints.delete(this.receiveHintKey(account, root));
    const cached = this.findValidEntry(root, multiplier, account);
    if (cached) {
      this.logWorkEvent('cache-hit', root, multiplier, account);
      return cached.work;
    }

    if (interactive) this.preemptBackgroundForInteractiveWork(root, multiplier, account);

    const key = this.requestKey(root, multiplier, account);
    const existing = this.inFlight.get(key);
    if (existing) {
      this.logWorkEvent('joined', root, multiplier, account, this.findPendingRequest(root, multiplier, account)?.id ?? null);
      return existing;
    }

    const pending = this.findPendingRequest(root, multiplier, account);
    if (pending) {
      if (pending.hinted) {
        pending.hinted = false;
        pending.hintConsumed = true;
      }
      pending.priority = interactive ? 100 : Math.max(pending.priority, 50);
      this.requests.sort((a, b) => b.priority - a.priority);
      this.logWorkEvent('joined', root, multiplier, account, pending.id);
      this.ensureWorker();
      this.processNext();
      const promise = this.attachRequestListener(pending);
      this.inFlight.set(key, promise);
      promise.finally(() => this.inFlight.delete(key)).catch(() => undefined);
      return promise;
    }

    const promise = new Promise<string>((resolve, reject) => {
      this.enqueue({
        id: ++this.nextRequestId,
        account,
        root,
        multiplier,
        priority: interactive ? 100 : 50,
        tier: multiplier < 1 ? 'receive' : 'send',
        hinted: false,
        hintConsumed: false,
        resolve,
        reject,
      });
    });
    this.inFlight.set(key, promise);
    promise.finally(() => this.inFlight.delete(key)).catch(() => undefined);
    return promise;
  }

  private enqueue(request: WorkRequest): void {
    const duplicate = this.requests.some(item =>
      item.root === request.root && item.account === request.account && item.multiplier === request.multiplier &&
      item.hinted === request.hinted);
    if (duplicate) return;
    this.requests.push(request);
    this.requests.sort((a, b) => b.priority - a.priority);
    this.logWorkEvent('queued', request.root, request.multiplier, request.account, request.id);
    this.processNext();
    this.publishState();
  }

  private ensureWorker(): void {
    if (this.worker) return;
    this.worker = new Worker(new URL('../workers/rspow.worker', import.meta.url), { type: 'module' });
    this.worker.onmessage = event => this.onWorkerMessage(event.data);
    this.worker.onerror = event => {
      const error = new Error(event.message || 'PoW worker failed');
      const request = this.activeRequest;
      this.activeRequest = null;
      this.activeWorkerRequestId = 0;
      this.clearActiveTimers();
      this.worker?.terminate();
      this.worker = null;
      if (request) this.requests.unshift(request);
      this.state$.next({ ...this.state$.value, lastError: error.message });
      this.lastErrorAccount = request?.account || null;
      this.lastErrorRoot = request?.root || null;
      setTimeout(() => this.processNext(), 1000);
    };
  }

  private processNext(): void {
    if (this.activeRequest) return;
    let request: WorkRequest | undefined;
    while (this.requests.length && !request) {
      const candidate = this.requests.shift()!;
      if (candidate.hinted && !candidate.hintConsumed) {
        if (!this.consumeReceiveHint(candidate)) continue;
        candidate.hintConsumed = true;
      }
      const cached = this.findValidEntry(candidate.root, candidate.multiplier, candidate.account);
      if (cached) {
        candidate.resolve(cached.work);
        continue;
      }
      request = candidate;
    }
    if (!request) {
      this.publishState();
      return;
    }
    this.activeRequest = request;
    this.activeStartedAt = Date.now();
    this.remoteRetryAttempt = 0;
    this.lastErrorAccount = null;
    this.lastErrorRoot = null;
    this.ensureStateTimer();
    const threshold = this.util.nano.difficultyFromMultiplier(
      request.multiplier,
      workDifficultyToThreshold('send'),
    );
    const currentRouting = this.powRouting.state;
    if (currentRouting.policy !== 'auto' && currentRouting.route) {
      this.startGeneration(request, threshold, currentRouting.route);
      return;
    }
    void this.powRouting.resolveRoute()
      .then(route => this.startGeneration(request, threshold, route))
      .catch(error => this.failRouteResolution(request, error));
  }

  private startGeneration(request: WorkRequest, threshold: string, route: PowRoute): void {
    if (this.activeRequest !== request) return;
    this.activeWorkerRequestId = ++this.workerRequestId;
    this.logWorkEvent(`started-${route}`, request.root, request.multiplier, request.account, request.id, threshold);
    if (route === 'remote') {
      this.state$.next({ ...this.state$.value, phase: 'remote', lastError: null });
      void this.tryRemoteWork(request, threshold);
    } else {
      this.state$.next({ ...this.state$.value, phase: 'local', lastError: null });
      this.ensureWorker();
      this.worker!.postMessage({ id: this.activeWorkerRequestId, root: request.root, threshold });
    }
    this.publishState();
  }

  private failRouteResolution(request: WorkRequest, error: unknown): void {
    if (this.activeRequest !== request) return;
    this.activeRequest = null;
    this.clearActiveTimers();
    this.lastErrorAccount = request.account || null;
    this.lastErrorRoot = request.root;
    this.state$.next({ ...this.state$.value, lastError: error instanceof Error ? error.message : String(error) });
    request.reject(error instanceof Error ? error : new Error(String(error)));
    this.publishState();
    this.processNext();
  }

  private onWorkerMessage(message: {id: number; ok: boolean; work?: string; error?: string}): void {
    if (message.id !== this.activeWorkerRequestId) return;
    const request = this.activeRequest;
    if (!request) return;
    this.clearActiveTimers();
    this.activeRequest = null;
    this.activeWorkerRequestId = 0;
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
      this.workCache = this.workCache.filter(item =>
        !(item.account === entry.account && item.root === entry.root && item.threshold === entry.threshold));
      this.workCache.push(entry);
      this.pruneWorkCache();
      if (this.workCache.length > this.cacheLength) {
        this.workCache.sort((a, b) => b.createdAt - a.createdAt);
        this.workCache.length = this.cacheLength;
      }
      this.persist();
      this.lastCompleted = { account: request.account || '', root: request.root, expiresAt: Date.now() + 3000 };
      this.logWorkEvent('completed', request.root, request.multiplier, request.account, request.id, threshold);
      if (this.completionTimer) clearTimeout(this.completionTimer);
      this.completionTimer = setTimeout(() => {
        this.completionTimer = null;
        this.publishState();
      }, 3000);
      request.resolve(entry.work);
    } else {
      const error = new Error(message.error || 'PoW generation failed');
      this.logWorkEvent('failed', request.root, request.multiplier, request.account, request.id);
      this.state$.next({ ...this.state$.value, lastError: error.message });
      this.lastErrorAccount = request.account || null;
      this.lastErrorRoot = request.root;
      request.reject(error);
    }
    this.publishState();
    this.processNext();
  }

  private async tryRemoteWork(request: WorkRequest, threshold: string): Promise<void> {
    if (this.activeRequest !== request) return;
    try {
      const response = await this.api.workGenerateOnce(
        request.root,
        threshold,
        this.appSettings.settings.customWorkServer || '',
      );
      const work = response?.work?.toUpperCase();
      if (work && this.util.nano.validateWork(request.root, threshold, work)) {
        this.clearActiveTimers();
        this.worker?.terminate();
        this.worker = null;
        this.onWorkerMessage({ id: this.activeWorkerRequestId, ok: true, work });
        return;
      }
      throw new Error('Remote PoW response failed validation');
    } catch (error) {
      if (this.activeRequest !== request) return;
      this.remoteRetryAttempt += 1;
      const delay = Math.min(30_000, 1_000 * 2 ** Math.min(this.remoteRetryAttempt - 1, 5));
      this.state$.next({ ...this.state$.value, lastError: error instanceof Error ? error.message : String(error) });
      this.lastErrorAccount = request.account || null;
      this.lastErrorRoot = request.root;
      this.remoteRetryTimer = setTimeout(() => this.tryRemoteWork(request, threshold), delay);
    }
  }

  private clearActiveTimers(): void {
    if (this.remoteRetryTimer) clearTimeout(this.remoteRetryTimer);
    this.remoteRetryTimer = null;
  }

  private cancelPendingRequests(error: Error): void {
    for (const request of this.requests) request.reject(error);
    this.requests = [];
    if (this.activeRequest) {
      this.activeRequest.reject(error);
      this.activeRequest = null;
      this.activeWorkerRequestId = 0;
    }
    this.clearActiveTimers();
    this.worker?.terminate();
    this.worker = null;
  }

  private cancelActiveRequest(error: Error): void {
    if (!this.activeRequest) return;
    this.clearActiveTimers();
    this.worker?.terminate();
    this.worker = null;
    this.activeRequest.reject(error);
    this.activeRequest = null;
    this.activeWorkerRequestId = 0;
  }

  /** Foreground wallet actions must never wait behind speculative work. */
  private preemptBackgroundForInteractiveWork(root: string, multiplier: number, account: string | null): void {
    const active = this.activeRequest;
    if (!active || active.priority >= 100) return;
    if (active.root === root && active.multiplier === multiplier && active.account === account) return;

    this.clearActiveTimers();
    this.worker?.terminate();
    this.worker = null;
    this.activeRequest = null;
    this.activeWorkerRequestId = 0;
    this.requests.push(active);
    this.requests.sort((a, b) => b.priority - a.priority);
    this.publishState();
  }

  private findValidEntry(root: string, multiplier: number, account: string | null): StoredWorkEntry | null {
    const threshold = this.util.nano.difficultyFromMultiplier(multiplier, workDifficultyToThreshold('send'));
    const matches = this.workCache.filter(entry =>
      entry.root === root && (account === null || entry.account === account));
    const invalidEntries: StoredWorkEntry[] = [];
    for (const entry of matches) {
      try {
        if (!this.util.nano.validateWork(root, entry.threshold, entry.work)) {
          invalidEntries.push(entry);
          continue;
        }
        if (this.util.nano.validateWork(root, threshold, entry.work)) return entry;
      } catch {
        invalidEntries.push(entry);
      }
    }
    if (invalidEntries.length > 0) {
      this.workCache = this.workCache.filter(entry => !invalidEntries.includes(entry));
      this.persist();
    }
    return null;
  }

  private requestKey(root: string, multiplier: number, account: string | null): string {
    return `${account || '*'}:${root}:${multiplier}`;
  }

  private logWorkEvent(
    event: string,
    root: string,
    multiplier: number,
    account: string | null,
    requestId: number | null = null,
    threshold?: string,
  ): void {
    console.debug('[WorkPool]', event, {
      requestId,
      account,
      root,
      threshold: threshold || this.util.nano.difficultyFromMultiplier(multiplier, workDifficultyToThreshold('send')),
      purpose: multiplier < 1 ? 'receive' : 'send',
    });
  }

  private receiveHintKey(account: string, root: string): string {
    return `${account}:${root}`;
  }

  private consumeReceiveHint(request: WorkRequest): boolean {
    if (!request.account) return false;
    const key = this.receiveHintKey(request.account, request.root);
    const hint = this.receiveHints.get(key);
    this.receiveHints.delete(key);
    return !!hint && hint.expiresAt > Date.now() && this.accountRoots.get(hint.account) === hint.root;
  }

  private pruneReceiveHints(): void {
    const now = Date.now();
    for (const [key, hint] of this.receiveHints) {
      if (hint.expiresAt <= now) this.receiveHints.delete(key);
    }
  }

  /** Removes durable entries that cannot be used by any current wallet frontier. */
  private pruneWorkCache(): void {
    if (this.accountRoots.size === 0) return;
    this.workCache = this.workCache.filter(entry =>
      !!entry.account && this.accountRoots.get(entry.account) === entry.root);
  }

  private findPendingRequest(root: string, multiplier: number, account: string | null): WorkRequest | undefined {
    return this.activeRequest?.root === root && this.activeRequest.account === account &&
      this.activeRequest.multiplier === multiplier
      ? this.activeRequest
      : this.requests.find(request => request.root === root && request.account === account && request.multiplier === multiplier);
  }

  private attachRequestListener(request: WorkRequest): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const previousResolve = request.resolve;
      const previousReject = request.reject;
      request.resolve = work => {
        previousResolve(work);
        resolve(work);
      };
      request.reject = error => {
        previousReject(error);
        reject(error);
      };
    });
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
    this.pruneReceiveHints();
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
      activeTier: this.activeRequest?.tier || null,
      receiveHints: this.receiveHints.size,
    });
    this.publishAccountStatuses();
  }

  public getAccountStatus(account: string): WorkAccountStatus | null {
    return this.accountStatusSubject.value.get(account) || null;
  }

  public retryAccountWork(account: string): void {
    const root = this.accountRoots.get(account);
    if (!root) return;
    const purpose = this.accountPurposes.get(account) || 'frontier';
    this.addWorkToCache(root, purpose === 'receive-open' ? 1 / 64 : 1, account, 100);
  }

  private publishAccountStatuses(): void {
    const now = Date.now();
    if (this.lastCompleted && this.lastCompleted.expiresAt <= now) this.lastCompleted = null;
    const statuses = new Map<string, WorkAccountStatus>();
    for (const [account, root] of this.accountRoots) {
      const activeRequest = this.activeRequest?.account === account ? this.activeRequest : null;
      const queuedRequest = this.requests.find(request => request.account === account && request.root === root) || null;
      const purpose: WorkPurpose = (activeRequest?.tier || queuedRequest?.tier) === 'receive'
        ? 'receive-open'
        : (this.accountPurposes.get(account) || 'frontier');
      const multiplier = purpose === 'receive-open' ? 1 / 64 : 1;
      const lastError = this.lastErrorAccount === account && this.lastErrorRoot === root
        ? this.state$.value.lastError
        : null;
      const completed = this.lastCompleted?.account === account && this.lastCompleted.root === root;
      statuses.set(account, {
        account,
        root,
        purpose,
        activity: activeRequest || queuedRequest ? 'active' : lastError ? 'error' : completed ? 'success' : 'idle',
        phase: activeRequest ? this.state$.value.phase : 'idle',
        active: !!activeRequest,
        queued: !!queuedRequest,
        cached: this.findValidEntry(root, multiplier, account) !== null,
        activeElapsedMs: activeRequest ? now - this.activeStartedAt : 0,
        lastError,
      });
    }
    this.accountStatusSubject.next(statuses);
  }
}
