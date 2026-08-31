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
    expect(service.state$.value.startedAt).not.toBeNull();
    expect(service.state$.value.completedAt).toBeNull();
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

  it('records total boot timing only after the readiness phase completes', async () => {
    const service = new StartupService();
    const phases = ['runtime', 'settings', 'cache', 'wallet', 'features', 'network', 'readiness'] as const;

    for (const phase of phases) await service.runPhase(phase, () => undefined);

    expect(service.state$.value.activePhase).toBeNull();
    expect(service.state$.value.startedAt).not.toBeNull();
    expect(service.state$.value.completedAt).not.toBeNull();
    expect(service.state$.value.completedAt).toBeGreaterThanOrEqual(service.state$.value.startedAt as number);
    await expect(service.runPhase('readiness', () => undefined)).rejects.toThrow('expected undefined, got readiness');
  });

  it('keeps network diagnostics narrow and actionable', () => {
    const service = new StartupService();

    service.reportNetwork('unavailable', 'no endpoint configured');
    expect(service.state$.value.network).toEqual({ status: 'unavailable', reason: 'no endpoint configured' });
    service.reportNetwork('connecting');
    expect(service.state$.value.network).toEqual({ status: 'connecting', reason: null });
    service.reportNetwork('ready');
    expect(service.state$.value.network).toEqual({ status: 'ready', reason: null });
  });
});
