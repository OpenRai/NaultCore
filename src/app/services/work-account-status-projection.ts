export type WorkPurpose = 'frontier' | 'receive-open';
export type WorkTier = 'send' | 'receive';

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

export function resolveWorkAccountPurpose(
  activeTier: WorkTier | null,
  queuedTier: WorkTier | null,
  configuredPurpose: WorkPurpose,
): WorkPurpose {
  return (activeTier || queuedTier) === 'receive' ? 'receive-open' : configuredPurpose;
}

export function projectWorkAccountStatus(input: {
  account: string;
  root: string;
  purpose: WorkPurpose;
  hasActiveOrQueuedRequest: boolean;
  active: boolean;
  queued: boolean;
  cached: boolean;
  phase: WorkAccountStatus['phase'];
  activeElapsedMs: number;
  lastError: string | null;
  completed: boolean;
}): WorkAccountStatus {
  const activity = input.hasActiveOrQueuedRequest
    ? 'active'
    : input.lastError
      ? 'error'
      : input.completed
        ? 'success'
        : 'idle';

  return {
    account: input.account,
    root: input.root,
    purpose: input.purpose,
    activity,
    phase: input.active ? input.phase : 'idle',
    active: input.active,
    queued: input.queued,
    cached: input.cached,
    activeElapsedMs: input.active ? input.activeElapsedMs : 0,
    lastError: input.lastError,
  };
}
