import { BehaviorSubject } from 'rxjs';

import { PowRoutingService } from './pow-routing.service';

function createService(source: string = 'auto'): any {
  const service: any = Object.create(PowRoutingService.prototype);
  service.appSettings = { settings: { powSource: source } };
  service.stateSubject = new BehaviorSubject({
    policy: 'auto',
    route: null,
    status: 'idle',
    error: null,
  });
  service.probeGeneration = 0;
  service.activeProbe = null;
  return service;
}

describe('PowRoutingService', () => {
  it('uses a manual policy without probing', async () => {
    const service = createService('remote');
    service.browserRecommendation = vi.fn();

    expect(await service.resolveRoute()).toBe('remote');

    expect(service.browserRecommendation).not.toHaveBeenCalled();
    expect(service.state).toEqual({ policy: 'remote', route: 'remote', status: 'resolved', error: null });
  });

  it('probes Auto once and reuses its resolved route', async () => {
    const service = createService();
    let probes = 0;
    service.browserRecommendation = async () => {
      probes++;
      return true;
    };

    expect(await service.resolveRoute()).toBe('local');
    expect(await service.resolveRoute()).toBe('local');

    expect(probes).toBe(1);
    expect(service.state.status).toBe('resolved');
  });

  it('forces a fresh Auto probe and updates the resolved route', async () => {
    const service = createService();
    let recommendation = true;
    const probeArguments: boolean[] = [];
    service.browserRecommendation = async (reprobe: boolean) => {
      probeArguments.push(reprobe);
      return recommendation;
    };

    await service.resolveRoute();
    recommendation = false;
    expect(await service.reprobe()).toBe('remote');

    expect(probeArguments).toEqual([false, true]);
    expect(service.state).toEqual({ policy: 'auto', route: 'remote', status: 'resolved', error: null });
  });
});
