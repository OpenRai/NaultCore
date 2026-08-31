import { StartupService } from './startup.service';
import { describe, expect, it } from 'vitest';

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

    await expect(service.runPhase('wallet', () => undefined))
      .rejects.toThrow('Startup phase out of order: expected runtime, got wallet');
    expect(service.state$.value.phases.runtime.status).toBe('pending');
  });

  it('publishes a failed phase and a network diagnostic reason', async () => {
    const service = new StartupService();
    const failure = new Error('node unavailable');

    await expect(service.runPhase('runtime', () => { throw failure; }))
      .rejects.toThrow('node unavailable');
    service.reportNetwork('failed', failure.message);

    expect(service.state$.value.phases.runtime.status).toBe('failed');
    expect(service.state$.value.phases.runtime.error).toBe('node unavailable');
    expect(service.state$.value.network).toEqual({ status: 'failed', reason: 'node unavailable' });
  });
});
