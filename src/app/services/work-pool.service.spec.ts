import { TestBed } from '@angular/core/testing';
import { ApiService } from './api.service';
import { UtilService } from './util.service';
import { WorkAccountStatus, WorkPoolService } from './work-pool.service';
import { AppSettingsService } from './app-settings.service';
import { PowRoutingService } from './pow-routing.service';
import { WorkPoolScheduler } from './work-pool-scheduler';

describe('WorkPoolScheduler', () => {
  interface Request { id: number; account: string | null; root: string; multiplier: number; priority: number; hinted: boolean; }
  const request = (id: number, account: string | null, priority = 50): Request => ({
    id, account, root: `root-${id}`, multiplier: 1, priority, hinted: false,
  });

  it('deduplicates equivalent queued work and dispatches by priority then account fairness', () => {
    const scheduler = new WorkPoolScheduler<Request>();
    const firstA = request(1, 'a');
    const secondA = request(2, 'a');
    const firstB = request(3, 'b');
    expect(scheduler.enqueue(firstA)).toBe(true);
    expect(scheduler.enqueue({ ...firstA })).toBe(false);
    scheduler.enqueue(secondA);
    scheduler.enqueue(firstB);

    expect(scheduler.takeNext(() => true)).toBe(firstA);
    expect(scheduler.takeNext(() => true)).toBe(firstB);
    expect(scheduler.takeNext(() => true)).toBe(secondA);
  });

  it('skips prepared-away work without advancing fairness and supports removal and retry ordering', () => {
    const scheduler = new WorkPoolScheduler<Request>();
    const discarded = request(1, 'a');
    const queued = request(2, 'b');
    const retry = request(3, 'c');
    scheduler.enqueue(discarded);
    scheduler.enqueue(queued);
    expect(scheduler.takeNext(item => item !== discarded)).toBe(queued);
    scheduler.retryAtFront(retry);
    expect(scheduler.takeNext(() => true)).toBe(retry);
    scheduler.enqueue(queued);
    expect(scheduler.removeWhere(item => item.account === 'b')).toEqual([queued]);
    expect(scheduler.clear()).toEqual([]);
    expect(scheduler.size).toBe(0);
  });
});

const sendThreshold = 'SEND-THRESHOLD';
const receiveThreshold = 'RECEIVE-THRESHOLD';

function partial(value: Record<string, unknown>): any {
  return expect.objectContaining(value);
}

function installTestClock(): void {
  vi.useFakeTimers();
}

function advanceTestClock(milliseconds: number): void {
  vi.advanceTimersByTime(milliseconds);
}

function uninstallTestClock(): void {
  vi.useRealTimers();
}

async function expectRejectedWithError(promise: Promise<unknown>, message: string): Promise<void> {
  let error: unknown;
  try {
    await promise;
  } catch (caught) {
    error = caught;
  }
  expect(error instanceof Error ? error.message : error).toBe(message);
}

class ControlledWorker {
  static instances: ControlledWorker[] = [];
  onmessage: ((event: MessageEvent<{id: number; ok: boolean; work?: string; error?: string}>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly posted: Array<{id: number; root: string; threshold: string}> = [];
  terminated = false;

  constructor() { ControlledWorker.instances.push(this); }
  postMessage(message: {id: number; root: string; threshold: string}): void { this.posted.push(message); }
  terminate(): void { this.terminated = true; }
  respond(message: {id: number; ok: boolean; work?: string; error?: string}): void {
    this.onmessage?.({ data: message } as MessageEvent<{id: number; ok: boolean; work?: string; error?: string}>);
  }
}

describe('WorkPoolService', () => {
  let originalWorker: typeof Worker;
  let api: { workGenerateOnce: any };
  const util = {
    nano: {
      difficultyFromMultiplier: (multiplier: number) => multiplier < 1 ? receiveThreshold : sendThreshold,
      validateWork: (_root: string, threshold: string, work: string) => work === `${threshold}-WORK`,
    },
  } as unknown as UtilService;
  const root = (character: string) => character.repeat(64);
  const worker = () => ControlledWorker.instances.at(-1)!;

  beforeEach(() => {
    localStorage.clear();
    installTestClock();
    ControlledWorker.instances = [];
    originalWorker = window.Worker;
    (window as unknown as { Worker: typeof Worker }).Worker = ControlledWorker as unknown as typeof Worker;
    api = { workGenerateOnce: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        WorkPoolService,
        { provide: UtilService, useValue: util },
        { provide: ApiService, useValue: api },
        { provide: AppSettingsService, useValue: { settings: { customWorkServer: '', customWorkServerAuth: '' } } },
        { provide: PowRoutingService, useValue: { state: { policy: 'local', route: 'local' }, resolveRoute: () => Promise.resolve('local') } },
      ],
    });
  });

  afterEach(() => {
    (window as unknown as { Worker: typeof Worker }).Worker = originalWorker;
    uninstallTestClock();
  });

  it('preserves active and queued external sweep work across unrelated wallet refreshes', async () => {
    const service = TestBed.inject(WorkPoolService);
    const receive = service.getWork(root('A'), 1 / 64, 'external');
    const send = service.getWork(root('B'), 1, 'external');
    service.syncAccountRoots([{ account: 'wallet', root: root('C'), multiplier: 1 }]);
    expect(worker().terminated).toBe(false);
    worker().respond({ id: worker().posted.at(-1)!.id, ok: true, work: `${receiveThreshold}-WORK` });
    expect(await receive).toBe(`${receiveThreshold}-WORK`);
    expect(worker().posted.at(-1)!.root).toBe(root('B'));
    expect(worker().posted.at(-1)!.threshold).toBe(sendThreshold);
    worker().respond({ id: worker().posted.at(-1)!.id, ok: true, work: `${sendThreshold}-WORK` });
    expect(await send).toBe(`${sendThreshold}-WORK`);
    expect(service.workExists(root('B'), 1, 'external')).toBe(true);
  });

  it('rotates account lanes before serving a busy account again', async () => {
    const service = TestBed.inject(WorkPoolService);
    const first = service.getWork(root('A'), 1 / 64, 'account0');
    const again = service.getWork(root('B'), 1 / 64, 'account0');
    const fifth = service.getWork(root('C'), 1 / 64, 'account5');
    const eighth = service.getWork(root('D'), 1 / 64, 'account8');
    for (const expected of ['A', 'C', 'D', 'B']) {
      expect(worker().posted.at(-1)!.root).toBe(root(expected));
      worker().respond({ id: worker().posted.at(-1)!.id, ok: true, work: `${receiveThreshold}-WORK` });
    }
    await Promise.all([first, again, fifth, eighth]);
  });

  it('cancels old external frontier work while preserving other account lanes', async () => {
    const service = TestBed.inject(WorkPoolService);
    const stale = service.getWork(root('A'), 1, 'external');
    const queued = service.getWork(root('B'), 1, 'external');
    const other = service.getWork(root('C'), 1 / 64, 'other');
    const oldWorker = worker();
    service.updateAccountFrontier('external', root('D'));
    expect(oldWorker.terminated).toBe(true);
    await expectRejectedWithError(stale, 'PoW request invalidated by frontier change');
    await expectRejectedWithError(queued, 'PoW request invalidated by frontier change');
    expect(worker().posted.at(-1)!.root).toBe(root('C'));
    worker().respond({ id: worker().posted.at(-1)!.id, ok: true, work: `${receiveThreshold}-WORK` });
    await other;
  });

  it('cancels changed wallet roots, preserves other lanes, and cancels removed accounts', async () => {
    const service = TestBed.inject(WorkPoolService);
    service.syncAccountRoots([{ account: 'wallet', root: root('A'), multiplier: 1 }]);
    const stale = service.getWork(root('A'), 1, 'wallet');
    const other = service.getWork(root('C'), 1 / 64, 'other');
    const oldWorker = worker();
    service.syncAccountRoots([{ account: 'wallet', root: root('B'), multiplier: 1 }]);
    expect(oldWorker.terminated).toBe(true);
    await expectRejectedWithError(stale, 'PoW request invalidated by frontier change');
    expect(worker().posted.at(-1)!.root).toBe(root('C'));
    worker().respond({ id: worker().posted.at(-1)!.id, ok: true, work: `${receiveThreshold}-WORK` });
    await other;
    const removed = service.getWork(root('B'), 1, 'wallet');
    service.syncAccountRoots([]);
    await expectRejectedWithError(removed, 'PoW request invalidated by frontier change');
    expect(service.state$.value.activeRoot).toBeNull();
  });

  it('ignores remote completions from cancelled work', async () => {
    const service = TestBed.inject(WorkPoolService);
    (TestBed.inject(PowRoutingService) as any).state = { policy: 'remote', route: 'remote' };
    let completeOld: (value: {work: string}) => void;
    api.workGenerateOnce.mockImplementationOnce(() => new Promise(resolve => completeOld = resolve));
    const stale = service.getWork(root('A'), 1, 'external');
    service.updateAccountFrontier('external', root('B'));
    await expectRejectedWithError(stale, 'PoW request invalidated by frontier change');
    api.workGenerateOnce.mockReturnValue(new Promise(() => undefined));
    const current = service.getWork(root('B'), 1, 'external');
    completeOld!({ work: `${sendThreshold}-WORK` });
    await Promise.resolve();
    expect(service.state$.value.activeRoot).toBe(root('B'));
    expect(service.workExists(root('B'), 1, 'external')).toBe(false);
    service.cancelAllWork();
    await expectRejectedWithError(current, 'Proof of Work generation cancelled by the user');
  });

  it('ignores an old remote generation after the same speculative job resumes', async () => {
    const service = TestBed.inject(WorkPoolService);
    (TestBed.inject(PowRoutingService) as any).state = { policy: 'remote', route: 'remote' };
    let completeOld: (value: {work: string}) => void;
    let completeResumed: (value: {work: string}) => void;
    api.workGenerateOnce
      .mockImplementationOnce(() => new Promise(resolve => completeOld = resolve))
      .mockResolvedValueOnce({ work: `${sendThreshold}-WORK` })
      .mockImplementationOnce(() => new Promise(resolve => completeResumed = resolve));
    service.addWorkToCache(root('A'), 1, 'background');
    await service.getWork(root('B'), 1, 'interactive', true);
    expect(service.state$.value.activeRoot).toBe(root('A'));
    completeOld!({ work: `${sendThreshold}-WORK` });
    await Promise.resolve();
    expect(service.workExists(root('A'), 1, 'background')).toBe(false);
    expect(service.state$.value.activeRoot).toBe(root('A'));
    completeResumed!({ work: `${sendThreshold}-WORK` });
    await Promise.resolve();
    expect(service.workExists(root('A'), 1, 'background')).toBe(true);
  });

  it('persists locally generated work and restores it only for its matching account and root', async () => {
    const service = TestBed.inject(WorkPoolService);
    const accountRoot = root('A');
    service.loadWorkCache();
    const generated = service.getWork(accountRoot, 1, 'nano_1');
    worker().respond({ id: worker().posted[0].id, ok: true, work: `${sendThreshold}-WORK` });
    expect(await generated).toBe(`${sendThreshold}-WORK`);
    expect(JSON.parse(localStorage.getItem(service.storeKey)!).version).toBe(2);

    const restored = TestBed.runInInjectionContext(() => new WorkPoolService());
    restored.loadWorkCache();
    expect(restored.workExists(accountRoot, 1, 'nano_1')).toBe(true);
    expect(restored.workExists(accountRoot, 1, 'nano_other')).toBe(false);
    expect(restored.workExists(root('B'), 1, 'nano_1')).toBe(false);
  });

  it('rejects a local worker failure without calling a remote provider', async () => {
    const service = TestBed.inject(WorkPoolService);
    const pending = service.getWork(root('A'), 1, 'nano_1');
    worker().respond({ id: worker().posted[0].id, ok: false, error: 'local worker failed' });
    await expectRejectedWithError(pending, 'local worker failed');
    expect(api.workGenerateOnce).not.toHaveBeenCalled();
  });

  it('uses the selected remote route without starting the local worker', async () => {
    const service = TestBed.inject(WorkPoolService);
    const routing = TestBed.inject(PowRoutingService) as any;
    routing.state = { policy: 'remote', route: 'remote' };
    api.workGenerateOnce.mockResolvedValue({ work: `${sendThreshold}-WORK` });
    const pending = service.getWork(root('A'), 1, 'nano_1');
    await Promise.resolve();
    expect(api.workGenerateOnce).toHaveBeenCalledWith(root('A'), sendThreshold, '', true, '');
    expect(await pending).toBe(`${sendThreshold}-WORK`);
    expect(ControlledWorker.instances.length).toBe(0);
  });

  it('passes the custom work server Authorization header only to the remote provider', async () => {
    const service = TestBed.inject(WorkPoolService);
    const routing = TestBed.inject(PowRoutingService) as any;
    const settings = TestBed.inject(AppSettingsService) as any;
    routing.state = { policy: 'remote', route: 'remote' };
    settings.settings.customWorkServer = 'https://work.example/api';
    settings.settings.customWorkServerAuth = 'Bearer work-token';
    api.workGenerateOnce.mockResolvedValue({ work: `${sendThreshold}-WORK` });

    const pending = service.getWork(root('A'), 1, 'nano_1');
    await Promise.resolve();

    expect(api.workGenerateOnce).toHaveBeenCalledWith(
      root('A'),
      sendThreshold,
      'https://work.example/api',
      true,
      'Bearer work-token',
    );
    expect(await pending).toBe(`${sendThreshold}-WORK`);
  });

  it('rejects invalid remote work, retries deterministically, and accepts the next valid response', async () => {
    const service = TestBed.inject(WorkPoolService);
    const routing = TestBed.inject(PowRoutingService) as any;
    routing.state = { policy: 'remote', route: 'remote' };
    api.workGenerateOnce.mockReturnValueOnce(Promise.resolve({ work: '0000000000000000' })).mockReturnValueOnce(Promise.resolve({ work: `${sendThreshold}-WORK` }));
    const pending = service.getWork(root('A'), 1, 'nano_1');
    await Promise.resolve();
    expect(service.state$.value.lastError).toBe('Remote PoW response failed validation');
    advanceTestClock(1_000);
    await Promise.resolve();
    expect(api.workGenerateOnce).toHaveBeenCalledTimes(2);
    expect(await pending).toBe(`${sendThreshold}-WORK`);
  });

  it('cancels pending remote work when its cache is cleared', async () => {
    const service = TestBed.inject(WorkPoolService);
    const routing = TestBed.inject(PowRoutingService) as any;
    routing.state = { policy: 'remote', route: 'remote' };
    api.workGenerateOnce.mockReturnValue(new Promise(() => undefined));
    const pending = service.getWork(root('A'), 1, 'nano_1');
    await Promise.resolve();
    service.clearCache();
    await expectRejectedWithError(pending, 'PoW cache cleared');
  });

  it('cancels active and queued work through the user control seam', async () => {
    const service = TestBed.inject(WorkPoolService);
    const pending = service.getWork(root('A'), 1, 'nano_1');
    await Promise.resolve();

    expect(service.cancelAllWork()).toBe(true);
    await expectRejectedWithError(pending, 'Proof of Work generation cancelled by the user');
    expect(service.state$.value.activeRoot).toBeNull();
    expect(service.state$.value.queued).toBe(0);
    expect(service.cancelAllWork()).toBe(false);
  });

  it('orders queued background work by priority', () => {
    const service = TestBed.inject(WorkPoolService);
    service.addWorkToCache(root('A'), 1, 'nano_a', 0);
    service.addWorkToCache(root('B'), 1, 'nano_b', 50);
    service.addWorkToCache(root('C'), 1, 'nano_c', 25);
    const local = worker();
    local.respond({ id: local.posted[0].id, ok: true, work: `${sendThreshold}-WORK` });
    local.respond({ id: local.posted[1].id, ok: true, work: `${sendThreshold}-WORK` });
    local.respond({ id: local.posted[2].id, ok: true, work: `${sendThreshold}-WORK` });
    expect(local.posted.map(request => request.root)).toEqual([root('A'), root('B'), root('C')]);
  });

  it('finishes an active receive before the interactive send, ahead of queued receives', async () => {
    const service = TestBed.inject(WorkPoolService);
    const receive = service.getWork(root('A'), 1 / 64, 'nano_1');
    const nextReceive = service.getWork(root('C'), 1 / 64, 'nano_3');
    const interactive = service.getWork(root('B'), 1, 'nano_2', true);
    const local = worker();
    expect(local.terminated).toBe(false);
    local.respond({ id: local.posted[0].id, ok: true, work: `${receiveThreshold}-WORK` });
    expect(await receive).toBe(`${receiveThreshold}-WORK`);
    expect(local.posted[1]).toEqual(partial({ root: root('B'), threshold: sendThreshold }));
    local.respond({ id: local.posted[1].id, ok: true, work: `${sendThreshold}-WORK` });
    expect(await interactive).toBe(`${sendThreshold}-WORK`);
    expect(local.posted[2].root).toBe(root('C'));
    local.respond({ id: local.posted[2].id, ok: true, work: `${receiveThreshold}-WORK` });
    await nextReceive;
  });

  it('preempts speculative work for an interactive send and resumes it afterward', async () => {
    const service = TestBed.inject(WorkPoolService);
    service.addWorkToCache(root('A'), 1, 'nano_1', 10);
    const original = worker();
    const interactive = service.getWork(root('B'), 1, 'nano_2', true);
    expect(original.terminated).toBe(true);
    expect(worker().posted[0].root).toBe(root('B'));
    worker().respond({ id: worker().posted[0].id, ok: true, work: `${sendThreshold}-WORK` });
    await interactive;
    expect(worker().posted[1].root).toBe(root('A'));
    worker().respond({ id: worker().posted[1].id, ok: true, work: `${sendThreshold}-WORK` });
  });

  it('keeps receive/open and send-tier cache validity isolated', async () => {
    const service = TestBed.inject(WorkPoolService);
    const accountRoot = root('A');
    const receive = service.getWork(accountRoot, 1 / 64, 'nano_1');
    worker().respond({ id: worker().posted[0].id, ok: true, work: `${receiveThreshold}-WORK` });
    expect(await receive).toBe(`${receiveThreshold}-WORK`);
    expect(service.workExists(accountRoot, 1 / 64, 'nano_1')).toBe(true);
    expect(service.workExists(accountRoot, 1, 'nano_1')).toBe(false);
    const send = service.getWork(accountRoot, 1, 'nano_1');
    expect(worker().posted[1].threshold).toBe(sendThreshold);
    worker().respond({ id: worker().posted[1].id, ok: true, work: `${sendThreshold}-WORK` });
    expect(await send).toBe(`${sendThreshold}-WORK`);
  });

  it('prunes stale, malformed, and frontier-invalid cache entries', () => {
    const service = TestBed.inject(WorkPoolService);
    localStorage.setItem(service.storeKey, JSON.stringify({ version: 2, entries: [
      { account: 'nano_current', root: root('A'), work: `${sendThreshold}-WORK`, threshold: sendThreshold, createdAt: 0 },
      { account: 'nano_stale', root: root('B'), work: `${sendThreshold}-WORK`, threshold: sendThreshold, createdAt: 0 },
      { account: 'nano_current', root: root('C'), work: 'invalid', threshold: sendThreshold, createdAt: 0 },
    ] }));
    service.loadWorkCache();
    service.syncAccountRoots([{ account: 'nano_current', root: root('A'), multiplier: 1 }]);
    expect(service.workExists(root('A'), 1, 'nano_current')).toBe(true);
    expect(service.workCache.some(entry => entry.account === 'nano_stale')).toBe(false);
    expect(service.workExists(root('C'), 1, 'nano_current')).toBe(false);
    service.syncAccountRoots([{ account: 'nano_current', root: root('D'), multiplier: 1 }]);
    expect(service.workCache.some(entry => entry.root === root('A'))).toBe(false);
  });

  it('does not precompute a frontier deliberately drained by a sweep', () => {
    const service = TestBed.inject(WorkPoolService);
    service.syncAccountRoots([{ account: 'nano_current', root: root('A'), multiplier: 1 }]);
    const firstWorker = worker();
    firstWorker.respond({ id: firstWorker.posted[0].id, ok: true, work: `${sendThreshold}-WORK` });

    service.syncAccountRoots([{ account: 'nano_current', root: root('B'), multiplier: 1 }]);
    expect(firstWorker.posted[1].root).toBe(root('B'));
    service.suppressPrecomputation('nano_current', root('B'));
    expect(firstWorker.terminated).toBe(true);

    service.syncAccountRoots([{ account: 'nano_current', root: root('B'), multiplier: 1 }]);
    expect(ControlledWorker.instances.length).toBe(1);

    service.syncAccountRoots([{ account: 'nano_current', root: root('C'), multiplier: 1 }]);
    expect(ControlledWorker.instances.length).toBe(2);
    expect(worker().posted[0].root).toBe(root('C'));
  });

  it('logs cache events with correlation metadata but never work values', async () => {
    const service = TestBed.inject(WorkPoolService);
    const debug = vi.spyOn(console, 'debug');
    const pending = service.getWork(root('A'), 1, 'nano_1');
    worker().respond({ id: worker().posted[0].id, ok: true, work: `${sendThreshold}-WORK` });
    expect(await pending).toBe(`${sendThreshold}-WORK`);

    expect(await service.getWork(root('A'), 1, 'nano_1')).toBe(`${sendThreshold}-WORK`);

    const debugCalls = (debug as any).mock?.calls ?? (debug as any).calls.allArgs();
    const cacheHit = debugCalls.find((args: any[]) => args[1] === 'cache-hit')!;
    expect(cacheHit).toEqual([
      '[WorkPool]',
      'cache-hit',
      partial({
        requestId: null,
        account: 'nano_1',
        root: root('A'),
        threshold: sendThreshold,
        purpose: 'send',
      }),
    ]);
    expect((cacheHit[2] as Record<string, unknown>).work).toBeUndefined();
  });

  it('publishes sanitized account status without raw work values', () => {
    const service = TestBed.inject(WorkPoolService);
    const snapshots: ReadonlyMap<string, WorkAccountStatus>[] = [];
    const subscription = service.accountStatus$.subscribe(status => snapshots.push(status));
    service.syncAccountRoots([{ account: 'nano_1', root: root('A'), multiplier: 1 }]);
    worker().respond({ id: worker().posted[0].id, ok: true, work: `${sendThreshold}-WORK` });
    subscription.unsubscribe();
    const status = snapshots.at(-1)!.get('nano_1')!;
    expect(status.activity).toBe('success');
    expect(status.cached).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(status, 'work')).toBe(false);
  });

  it('does not republish unchanged account statuses for a 25-account wallet', () => {
    const service = TestBed.inject(WorkPoolService);
    const accountCount = 25;
    const iterations = 5_000;
    const demands = Array.from({ length: accountCount }, (_, index) => ({
      account: `nano_${index}`,
      root: String.fromCharCode(65 + index).repeat(64),
      multiplier: 1,
    }));
    localStorage.setItem(service.storeKey, JSON.stringify({
      version: 2,
      entries: demands.map(demand => ({
        account: demand.account,
        root: demand.root,
        work: `${sendThreshold}-WORK`,
        threshold: sendThreshold,
        createdAt: 0,
      })),
    }));
    service.loadWorkCache();
    service.syncAccountRoots(demands);

    let emissions = 0;
    const subscription = service.accountStatus$.subscribe(() => emissions++);
    emissions = 0;
    service['publishState']();

    for (let index = 0; index < iterations; index++) service['publishState']();
    subscription.unsubscribe();

    // Baseline: this fixture emitted 5,000 identical maps in 5,000 publishes.
    expect(emissions).toBe(0);
  });
});
