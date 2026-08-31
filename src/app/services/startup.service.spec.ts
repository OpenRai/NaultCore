import { StartupService } from './startup.service';

describe('StartupService', () => {
  it('runs phases in order and publishes completion state', async () => {
    const service = new StartupService();
    const phases: string[] = [];

    await service.runPhase('runtime', () => phases.push('runtime'));
    await service.runPhase('settings', () => phases.push('settings'));
    await service.runPhase('cache', () => phases.push('cache'));

    expect(phases).toEqual(['runtime', 'settings', 'cache']);
    expect(service.state$.value.activePhase).toBeNull();
    expect(service.state$.value.phases.cache.status).toBe('complete');
  });

  it('rejects out-of-order phases without advancing the pipeline', async () => {
    const service = new StartupService();

    await expectAsync(service.runPhase('wallet', () => undefined))
      .toBeRejectedWithError('Startup phase out of order: expected runtime, got wallet');
    expect(service.state$.value.phases.runtime.status).toBe('pending');
  });

  it('publishes a failed phase and a network diagnostic reason', async () => {
    const service = new StartupService();
    const failure = new Error('node unavailable');

    await expectAsync(service.runPhase('runtime', () => { throw failure; }))
      .toBeRejectedWithError('node unavailable');
    service.reportNetwork('failed', failure.message);

    expect(service.state$.value.phases.runtime.status).toBe('failed');
    expect(service.state$.value.phases.runtime.error).toBe('node unavailable');
    expect(service.state$.value.network).toEqual({ status: 'failed', reason: 'node unavailable' });
  });
});
