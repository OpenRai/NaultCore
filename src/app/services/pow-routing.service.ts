import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { recommendLocalPow } from '@openrai/nano-core/web';

import { AppSettingsService, PoWSource } from './app-settings.service';

export type PowPolicy = 'auto' | 'local' | 'remote';
export type PowRoute = Exclude<PowPolicy, 'auto'>;
export type PowResolutionStatus = 'idle' | 'probing' | 'resolved' | 'error';

export interface PowRoutingState {
  policy: PowPolicy;
  route: PowRoute | null;
  status: PowResolutionStatus;
  error: string | null;
}

@Injectable({ providedIn: 'root' })
export class PowRoutingService {
  private readonly appSettings = inject(AppSettingsService);
  private readonly stateSubject = new BehaviorSubject<PowRoutingState>({
    policy: 'auto',
    route: null,
    status: 'idle',
    error: null,
  });

  readonly state$ = this.stateSubject.asObservable();

  private probeGeneration = 0;
  private activeProbe: { generation: number; promise: Promise<PowRoute> } | null = null;
  private readonly browserRecommendation = recommendLocalPow;

  get state(): PowRoutingState {
    return this.stateSubject.value;
  }

  /** Maps pre-Auto settings without making old persisted values invalid. */
  policyFromSource(source: PoWSource | string | null | undefined): PowPolicy {
    switch (source) {
      case 'local':
        return 'local';
      case 'remote':
      case 'server':
      case 'custom':
        return 'remote';
      case 'clientCPU':
      case 'clientWebGL':
        return 'local';
      case 'auto':
      case 'best':
      default:
        return 'auto';
    }
  }

  /** Synchronizes observable policy state after app settings are loaded. */
  syncFromSettings(): PowRoutingState {
    return this.applyPolicy(this.policyFromSource(this.appSettings.settings.powSource));
  }

  /** Applies a saved policy; Auto is resolved lazily or by the caller. */
  applyPolicy(policy: PowPolicy): PowRoutingState {
    const route = policy === 'auto' ? null : policy;
    const next: PowRoutingState = {
      policy,
      route,
      status: policy === 'auto' ? 'idle' : 'resolved',
      error: null,
    };
    this.stateSubject.next(next);
    return next;
  }

  /** Resolve the current policy, using the web binding's cached recommendation. */
  async resolveRoute(reprobe = false): Promise<PowRoute> {
    const policy = this.policyFromSource(this.appSettings.settings.powSource);
    if (policy !== 'auto') {
      this.applyPolicy(policy);
      return policy;
    }

    const current = this.stateSubject.value;
    if (!reprobe && current.policy === 'auto' && current.status === 'resolved' && current.route) {
      return current.route;
    }
    if (!reprobe && this.activeProbe) return this.activeProbe.promise;

    const generation = ++this.probeGeneration;
    this.stateSubject.next({ policy: 'auto', route: null, status: 'probing', error: null });
    const promise = Promise.resolve()
      .then(() => this.browserRecommendation(reprobe))
      .then(recommendLocal => {
        const route: PowRoute = recommendLocal ? 'local' : 'remote';
        if (generation === this.probeGeneration) {
          this.stateSubject.next({ policy: 'auto', route, status: 'resolved', error: null });
        }
        return route;
      })
      .catch(error => {
        if (generation === this.probeGeneration) {
          this.stateSubject.next({
            policy: 'auto',
            route: null,
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
          });
        }
        throw error;
      })
      .finally(() => {
        if (this.activeProbe?.generation === generation) this.activeProbe = null;
      });

    this.activeProbe = { generation, promise };
    return promise;
  }

  /** Explicitly replace the cached Auto recommendation with a fresh probe. */
  reprobe(): Promise<PowRoute> {
    return this.resolveRoute(true);
  }
}
