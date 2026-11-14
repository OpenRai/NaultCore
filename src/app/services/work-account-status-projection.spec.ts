import { projectWorkAccountStatus, resolveWorkAccountPurpose } from './work-account-status-projection';

describe('Work account status projection', () => {
  const base = {
    account: 'nano_1',
    root: 'A'.repeat(64),
    purpose: 'frontier' as const,
    hasActiveOrQueuedRequest: false,
    active: false,
    queued: false,
    cached: false,
    phase: 'idle' as const,
    activeElapsedMs: 0,
    lastError: null,
    completed: false,
  };

  it('projects an idle account and a queued account without claiming active work', () => {
    expect(projectWorkAccountStatus(base)).toMatchObject({ activity: 'idle', phase: 'idle', active: false });
    expect(projectWorkAccountStatus({
      ...base,
      hasActiveOrQueuedRequest: true,
      queued: true,
      cached: true,
    })).toMatchObject({ activity: 'active', phase: 'idle', active: false, queued: true, cached: true });
  });

  it('projects active work with its phase and elapsed time', () => {
    expect(projectWorkAccountStatus({
      ...base,
      hasActiveOrQueuedRequest: true,
      active: true,
      phase: 'remote',
      activeElapsedMs: 1250,
    })).toMatchObject({ activity: 'active', phase: 'remote', active: true, activeElapsedMs: 1250 });
  });

  it('gives active work precedence over errors and errors precedence over completion', () => {
    expect(projectWorkAccountStatus({
      ...base,
      hasActiveOrQueuedRequest: true,
      active: true,
      lastError: 'old failure',
      completed: true,
    }).activity).toBe('active');
    expect(projectWorkAccountStatus({
      ...base,
      lastError: 'generation failed',
      completed: true,
    }).activity).toBe('error');
    expect(projectWorkAccountStatus({ ...base, completed: true }).activity).toBe('success');
  });

  it('uses receive work purpose for active or queued receive requests', () => {
    expect(resolveWorkAccountPurpose('receive', 'send', 'frontier')).toBe('receive-open');
    expect(resolveWorkAccountPurpose(null, 'receive', 'frontier')).toBe('receive-open');
    expect(resolveWorkAccountPurpose('send', null, 'receive-open')).toBe('receive-open');
  });
});
