import { TestBed } from '@angular/core/testing';
import { ApiService } from './api.service';
import { UtilService } from './util.service';
import { WorkPoolService } from './work-pool.service';

describe('WorkPoolService', () => {
  let originalWorker: typeof Worker;
  let postedWork: Array<{root: string; threshold: string}>;
  const sendThreshold = 'SEND-THRESHOLD';
  const receiveThreshold = 'RECEIVE-THRESHOLD';
  const util = {
    nano: {
      difficultyFromMultiplier: (multiplier: number) => multiplier < 1 ? receiveThreshold : sendThreshold,
      validateWork: (_root: string, threshold: string, work: string) => work === `${threshold}-WORK`,
    },
  } as unknown as UtilService;

  beforeEach(() => {
    localStorage.clear();
    postedWork = [];
    originalWorker = window.Worker;
    (window as any).Worker = class {
      onmessage: ((event: any) => void) | null = null;
      onerror: ((event: any) => void) | null = null;
      postMessage(message: {id: number; root: string; threshold: string}): void {
        postedWork.push(message);
        setTimeout(() => this.onmessage?.({ data: { id: message.id, ok: true, work: `${message.threshold}-WORK` } }), 0);
      }
      terminate(): void { /* test worker */ }
    };
    TestBed.configureTestingModule({
      providers: [
        WorkPoolService,
        { provide: UtilService, useValue: util },
        { provide: ApiService, useValue: {} },
      ],
    });
  });

  afterEach(() => { (window as any).Worker = originalWorker; });

  it('restores account-scoped work and keeps it when the frontier matches', () => {
    localStorage.setItem('nanovault-workcache', JSON.stringify({
      version: 2,
      entries: [{ account: 'nano_1', root: 'A'.repeat(64), work: `${sendThreshold}-WORK`, threshold: sendThreshold, createdAt: Date.now() }],
    }));
    const service = TestBed.inject(WorkPoolService);
    service.loadWorkCache();
    service.syncAccountRoots([{ account: 'nano_1', root: 'A'.repeat(64), multiplier: 1 }]);
    expect(service.workExists('A'.repeat(64), 1, 'nano_1')).toBeTrue();
    expect(service.state$.value.ready).toBe(1);
  });

  it('invalidates persisted work when the account frontier changes', () => {
    localStorage.setItem('nanovault-workcache', JSON.stringify({
      version: 2,
      entries: [{ account: 'nano_1', root: 'A'.repeat(64), work: `${sendThreshold}-WORK`, threshold: sendThreshold, createdAt: Date.now() }],
    }));
    const service = TestBed.inject(WorkPoolService);
    service.loadWorkCache();
    service.syncAccountRoots([{ account: 'nano_1', root: 'C'.repeat(64), multiplier: 1 }]);
    expect(service.workCache.some(entry => entry.root === 'A'.repeat(64))).toBeFalse();
  });

  it('runs a receive hint before, but never instead of, the send-tier demand', async () => {
    const service = TestBed.inject(WorkPoolService);
    const otherRoot = 'B'.repeat(64);
    const hintedRoot = 'A'.repeat(64);

    service.syncAccountRoots([
      { account: 'nano_other', root: otherRoot, multiplier: 1 },
      { account: 'nano_1', root: hintedRoot, multiplier: 1 },
    ]);
    service.noteReceiveExpected('nano_1', hintedRoot);
    service.noteReceiveExpected('nano_1', hintedRoot);

    await new Promise(resolve => setTimeout(resolve, 25));

    expect(postedWork.map(request => `${request.root}:${request.threshold}`)).toEqual([
      `${otherRoot}:${sendThreshold}`,
      `${hintedRoot}:${receiveThreshold}`,
      `${hintedRoot}:${sendThreshold}`,
    ]);
    expect(service.workCache.some(entry => entry.account === 'nano_1' && entry.threshold === receiveThreshold)).toBeTrue();
    expect(service.workCache.some(entry => entry.account === 'nano_1' && entry.threshold === sendThreshold)).toBeTrue();
  });

  it('does not let receive-tier work satisfy a send-tier request after restart', async () => {
    const root = 'A'.repeat(64);
    localStorage.setItem('nanovault-workcache', JSON.stringify({
      version: 2,
      entries: [{ account: 'nano_1', root, work: `${receiveThreshold}-WORK`, threshold: receiveThreshold, createdAt: Date.now() }],
    }));
    const service = TestBed.inject(WorkPoolService);
    service.loadWorkCache();

    expect(service.workExists(root, 1 / 64, 'nano_1')).toBeTrue();
    expect(service.workExists(root, 1, 'nano_1')).toBeFalse();

    service.syncAccountRoots([{ account: 'nano_1', root, multiplier: 1 }]);
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(service.workExists(root, 1, 'nano_1')).toBeTrue();
  });

  it('preempts a background receive for an interactive send', async () => {
    const service = TestBed.inject(WorkPoolService);
    const receiveRoot = 'A'.repeat(64);
    const interactiveRoot = 'B'.repeat(64);

    const receiveWork = service.getWork(receiveRoot, 1 / 64, 'nano_1');
    await expectAsync(service.getWork(interactiveRoot, 1, 'nano_1', true)).toBeResolvedTo(`${sendThreshold}-WORK`);

    expect(postedWork.slice(0, 2).map(request => request.root)).toEqual([receiveRoot, interactiveRoot]);
    await expectAsync(receiveWork).toBeResolvedTo(`${receiveThreshold}-WORK`);
  });

  it('prunes cache entries detached from the current wallet after generation', async () => {
    const service = TestBed.inject(WorkPoolService);
    const currentRoot = 'A'.repeat(64);
    const staleRoot = 'B'.repeat(64);

    service.syncAccountRoots([{ account: 'nano_1', root: currentRoot, multiplier: 1 }]);
    service.workCache.push({
      account: 'nano_stale',
      root: staleRoot,
      work: `${sendThreshold}-WORK`,
      threshold: sendThreshold,
      createdAt: Date.now(),
    });
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(service.workCache.some(entry => entry.root === staleRoot)).toBeFalse();
    expect(service.workCache.some(entry => entry.root === currentRoot)).toBeTrue();
  });
});
