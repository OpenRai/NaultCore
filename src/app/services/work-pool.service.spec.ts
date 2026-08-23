import { TestBed } from '@angular/core/testing';
import { ApiService } from './api.service';
import { UtilService } from './util.service';
import { WorkPoolService } from './work-pool.service';

describe('WorkPoolService', () => {
  let originalWorker: typeof Worker;
  const util = {
    nano: {
      difficultyFromMultiplier: () => 'fffffff800000000',
      validateWork: () => true,
    },
  } as unknown as UtilService;

  beforeEach(() => {
    localStorage.clear();
    originalWorker = window.Worker;
    (window as any).Worker = class {
      onmessage: ((event: any) => void) | null = null;
      onerror: ((event: any) => void) | null = null;
      postMessage(): void { setTimeout(() => this.onmessage?.({ data: { ok: true, work: 'C'.repeat(16) } }), 0); }
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
      entries: [{ account: 'nano_1', root: 'A'.repeat(64), work: 'B'.repeat(16), threshold: 'fffffff800000000', createdAt: Date.now() }],
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
      entries: [{ account: 'nano_1', root: 'A'.repeat(64), work: 'B'.repeat(16), threshold: 'fffffff800000000', createdAt: Date.now() }],
    }));
    const service = TestBed.inject(WorkPoolService);
    service.loadWorkCache();
    service.syncAccountRoots([{ account: 'nano_1', root: 'C'.repeat(64), multiplier: 1 }]);
    expect(service.workCache.some(entry => entry.root === 'A'.repeat(64))).toBeFalse();
  });
});
