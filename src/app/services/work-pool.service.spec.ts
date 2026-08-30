import { TestBed } from '@angular/core/testing';
import { ApiService } from './api.service';
import { UtilService } from './util.service';
import { WorkAccountStatus, WorkPoolService } from './work-pool.service';
import { AppSettingsService } from './app-settings.service';
import { PowRoutingService } from './pow-routing.service';

const sendThreshold = 'SEND-THRESHOLD';
const receiveThreshold = 'RECEIVE-THRESHOLD';

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
  let api: jasmine.SpyObj<ApiService>;
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
    jasmine.clock().install();
    ControlledWorker.instances = [];
    originalWorker = window.Worker;
    (window as unknown as { Worker: typeof Worker }).Worker = ControlledWorker as unknown as typeof Worker;
    api = jasmine.createSpyObj<ApiService>('ApiService', ['workGenerateOnce']);
    TestBed.configureTestingModule({
      providers: [
        WorkPoolService,
        { provide: UtilService, useValue: util },
        { provide: ApiService, useValue: api },
        { provide: AppSettingsService, useValue: { settings: { customWorkServer: '' } } },
        { provide: PowRoutingService, useValue: { state: { policy: 'local', route: 'local' }, resolveRoute: () => Promise.resolve('local') } },
      ],
    });
  });

  afterEach(() => {
    (window as unknown as { Worker: typeof Worker }).Worker = originalWorker;
    jasmine.clock().uninstall();
  });

  it('persists locally generated work and restores it only for its matching account and root', async () => {
    const service = TestBed.inject(WorkPoolService);
    const accountRoot = root('A');
    service.loadWorkCache();
    const generated = service.getWork(accountRoot, 1, 'nano_1');
    worker().respond({ id: worker().posted[0].id, ok: true, work: `${sendThreshold}-WORK` });
    await expectAsync(generated).toBeResolvedTo(`${sendThreshold}-WORK`);
    expect(JSON.parse(localStorage.getItem(service.storeKey)!).version).toBe(2);

    const restored = TestBed.runInInjectionContext(() => new WorkPoolService());
    restored.loadWorkCache();
    expect(restored.workExists(accountRoot, 1, 'nano_1')).toBeTrue();
    expect(restored.workExists(accountRoot, 1, 'nano_other')).toBeFalse();
    expect(restored.workExists(root('B'), 1, 'nano_1')).toBeFalse();
  });

  it('rejects a local worker failure without calling a remote provider', async () => {
    const service = TestBed.inject(WorkPoolService);
    const pending = service.getWork(root('A'), 1, 'nano_1');
    worker().respond({ id: worker().posted[0].id, ok: false, error: 'local worker failed' });
    await expectAsync(pending).toBeRejectedWithError('local worker failed');
    expect(api.workGenerateOnce).not.toHaveBeenCalled();
  });

  it('uses the selected remote route without starting the local worker', async () => {
    const service = TestBed.inject(WorkPoolService);
    const routing = TestBed.inject(PowRoutingService) as any;
    routing.state = { policy: 'remote', route: 'remote' };
    api.workGenerateOnce.and.resolveTo({ work: `${sendThreshold}-WORK` });
    const pending = service.getWork(root('A'), 1, 'nano_1');
    await Promise.resolve();
    expect(api.workGenerateOnce).toHaveBeenCalledWith(root('A'), sendThreshold, '');
    await expectAsync(pending).toBeResolvedTo(`${sendThreshold}-WORK`);
    expect(ControlledWorker.instances).toHaveSize(0);
  });

  it('rejects invalid remote work, retries deterministically, and accepts the next valid response', async () => {
    const service = TestBed.inject(WorkPoolService);
    const routing = TestBed.inject(PowRoutingService) as any;
    routing.state = { policy: 'remote', route: 'remote' };
    api.workGenerateOnce.and.returnValues(Promise.resolve({ work: '0000000000000000' }), Promise.resolve({ work: `${sendThreshold}-WORK` }));
    const pending = service.getWork(root('A'), 1, 'nano_1');
    await Promise.resolve();
    expect(service.state$.value.lastError).toBe('Remote PoW response failed validation');
    jasmine.clock().tick(1_000);
    await Promise.resolve();
    expect(api.workGenerateOnce).toHaveBeenCalledTimes(2);
    await expectAsync(pending).toBeResolvedTo(`${sendThreshold}-WORK`);
  });

  it('cancels pending remote work when its cache is cleared', async () => {
    const service = TestBed.inject(WorkPoolService);
    const routing = TestBed.inject(PowRoutingService) as any;
    routing.state = { policy: 'remote', route: 'remote' };
    api.workGenerateOnce.and.returnValue(new Promise(() => undefined));
    const pending = service.getWork(root('A'), 1, 'nano_1');
    await Promise.resolve();
    service.clearCache();
    await expectAsync(pending).toBeRejectedWithError('PoW cache cleared');
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

  it('preempts speculative receive work for an interactive send', async () => {
    const service = TestBed.inject(WorkPoolService);
    const receive = service.getWork(root('A'), 1 / 64, 'nano_1');
    const interactive = service.getWork(root('B'), 1, 'nano_1', true);
    const initialWorker = ControlledWorker.instances[0];
    const interactiveWorker = worker();
    expect(initialWorker.terminated).toBeTrue();
    expect(interactiveWorker.posted[0]).toEqual(jasmine.objectContaining({ root: root('B'), threshold: sendThreshold }));
    interactiveWorker.respond({ id: interactiveWorker.posted[0].id, ok: true, work: `${sendThreshold}-WORK` });
    await expectAsync(interactive).toBeResolvedTo(`${sendThreshold}-WORK`);
    interactiveWorker.respond({ id: interactiveWorker.posted[1].id, ok: true, work: `${receiveThreshold}-WORK` });
    await expectAsync(receive).toBeResolvedTo(`${receiveThreshold}-WORK`);
  });

  it('keeps receive/open and send-tier cache validity isolated', async () => {
    const service = TestBed.inject(WorkPoolService);
    const accountRoot = root('A');
    const receive = service.getWork(accountRoot, 1 / 64, 'nano_1');
    worker().respond({ id: worker().posted[0].id, ok: true, work: `${receiveThreshold}-WORK` });
    await expectAsync(receive).toBeResolvedTo(`${receiveThreshold}-WORK`);
    expect(service.workExists(accountRoot, 1 / 64, 'nano_1')).toBeTrue();
    expect(service.workExists(accountRoot, 1, 'nano_1')).toBeFalse();
    const send = service.getWork(accountRoot, 1, 'nano_1');
    expect(worker().posted[1].threshold).toBe(sendThreshold);
    worker().respond({ id: worker().posted[1].id, ok: true, work: `${sendThreshold}-WORK` });
    await expectAsync(send).toBeResolvedTo(`${sendThreshold}-WORK`);
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
    expect(service.workExists(root('A'), 1, 'nano_current')).toBeTrue();
    expect(service.workCache.some(entry => entry.account === 'nano_stale')).toBeFalse();
    expect(service.workExists(root('C'), 1, 'nano_current')).toBeFalse();
    service.syncAccountRoots([{ account: 'nano_current', root: root('D'), multiplier: 1 }]);
    expect(service.workCache.some(entry => entry.root === root('A'))).toBeFalse();
  });

  it('does not precompute a frontier deliberately drained by a sweep', () => {
    const service = TestBed.inject(WorkPoolService);
    service.syncAccountRoots([{ account: 'nano_current', root: root('A'), multiplier: 1 }]);
    const firstWorker = worker();
    firstWorker.respond({ id: firstWorker.posted[0].id, ok: true, work: `${sendThreshold}-WORK` });

    service.syncAccountRoots([{ account: 'nano_current', root: root('B'), multiplier: 1 }]);
    expect(firstWorker.posted[1].root).toBe(root('B'));
    service.suppressPrecomputation('nano_current', root('B'));
    expect(firstWorker.terminated).toBeTrue();

    service.syncAccountRoots([{ account: 'nano_current', root: root('B'), multiplier: 1 }]);
    expect(ControlledWorker.instances).toHaveSize(1);

    service.syncAccountRoots([{ account: 'nano_current', root: root('C'), multiplier: 1 }]);
    expect(ControlledWorker.instances).toHaveSize(2);
    expect(worker().posted[0].root).toBe(root('C'));
  });

  it('logs cache events with correlation metadata but never work values', async () => {
    const service = TestBed.inject(WorkPoolService);
    const debug = spyOn(console, 'debug');
    const pending = service.getWork(root('A'), 1, 'nano_1');
    worker().respond({ id: worker().posted[0].id, ok: true, work: `${sendThreshold}-WORK` });
    await expectAsync(pending).toBeResolvedTo(`${sendThreshold}-WORK`);

    await expectAsync(service.getWork(root('A'), 1, 'nano_1')).toBeResolvedTo(`${sendThreshold}-WORK`);

    const cacheHit = debug.calls.allArgs().find(args => args[1] === 'cache-hit')!;
    expect(cacheHit).toEqual([
      '[WorkPool]',
      'cache-hit',
      jasmine.objectContaining({
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
    expect(status.cached).toBeTrue();
    expect(Object.prototype.hasOwnProperty.call(status, 'work')).toBeFalse();
  });
});
