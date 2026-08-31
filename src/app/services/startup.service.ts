import { Injectable, InjectionToken } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type StartupPhaseId =
  | 'runtime'
  | 'settings'
  | 'cache'
  | 'wallet'
  | 'features'
  | 'network'
  | 'readiness';

export type StartupPhaseStatus = 'pending' | 'running' | 'complete' | 'failed';
export type StartupNetworkStatus = 'unavailable' | 'connecting' | 'ready' | 'failed';

/** Runtime seams used by startup orchestration and deterministic app-shell tests. */
export interface StartupRuntimeAdapters {
  httpReady?: () => Promise<void> | void;
  websocketConnect?: () => void;
  nostrStart?: () => Promise<void> | void;
}

export const STARTUP_RUNTIME_ADAPTERS = new InjectionToken<StartupRuntimeAdapters>('STARTUP_RUNTIME_ADAPTERS', {
  providedIn: 'root',
  factory: () => ({}),
});

export interface StartupPhaseState {
  status: StartupPhaseStatus;
  startedAt: number | null;
  completedAt: number | null;
  error: string | null;
}

export interface StartupState {
  activePhase: StartupPhaseId | null;
  startedAt: number | null;
  completedAt: number | null;
  phases: Readonly<Record<StartupPhaseId, StartupPhaseState>>;
  network: {
    status: StartupNetworkStatus;
    reason: string | null;
  };
}

const phaseOrder: StartupPhaseId[] = [
  'runtime', 'settings', 'cache', 'wallet', 'features', 'network', 'readiness',
];

function createPhaseState(): StartupPhaseState {
  return { status: 'pending', startedAt: null, completedAt: null, error: null };
}

function createInitialState(): StartupState {
  return {
    activePhase: null,
    startedAt: null,
    completedAt: null,
    phases: {
      runtime: createPhaseState(),
      settings: createPhaseState(),
      cache: createPhaseState(),
      wallet: createPhaseState(),
      features: createPhaseState(),
      network: createPhaseState(),
      readiness: createPhaseState(),
    },
    network: { status: 'unavailable', reason: null },
  };
}

@Injectable({ providedIn: 'root' })
export class StartupService {
  readonly state$ = new BehaviorSubject<StartupState>(createInitialState());
  private nextPhaseIndex = 0;

  async runPhase<T>(phase: StartupPhaseId, work: () => Promise<T> | T): Promise<T> {
    const activePhase = this.state$.value.activePhase;
    if (activePhase !== null) {
      throw new Error(`Startup phase already running: ${activePhase}`);
    }
    if (phaseOrder[this.nextPhaseIndex] !== phase) {
      throw new Error(`Startup phase out of order: expected ${phaseOrder[this.nextPhaseIndex]}, got ${phase}`);
    }

    const startedAt = Date.now();
    this.updatePhase(phase, { status: 'running', startedAt, completedAt: null, error: null }, phase);
    try {
      const result = await work();
      this.updatePhase(phase, { status: 'complete', completedAt: Date.now() }, null);
      this.nextPhaseIndex += 1;
      return result;
    } catch (error) {
      this.updatePhase(phase, {
        status: 'failed',
        completedAt: Date.now(),
        error: error instanceof Error ? error.message : String(error),
      }, null);
      throw error;
    }
  }

  reportNetwork(status: StartupNetworkStatus, reason: string | null = null): void {
    this.state$.next({ ...this.state$.value, network: { status, reason } });
  }

  private updatePhase(phase: StartupPhaseId, update: Partial<StartupPhaseState>, activePhase: StartupPhaseId | null): void {
    const phases = {
      ...this.state$.value.phases,
      [phase]: { ...this.state$.value.phases[phase], ...update },
    };
    this.state$.next({
      ...this.state$.value,
      activePhase,
      startedAt: phase === 'runtime' && update.status === 'running' ? update.startedAt : this.state$.value.startedAt,
      completedAt: phase === 'readiness' && update.status === 'complete' ? update.completedAt : this.state$.value.completedAt,
      phases,
    });
  }
}
