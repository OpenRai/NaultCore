import { TestBed } from '@angular/core/testing';
import { DestroyRef, NgModule, NO_ERRORS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppComponent } from './app.component';

@NgModule({ declarations: [AppComponent], imports: [CommonModule], schemas: [NO_ERRORS_SCHEMA] })
class UpdateChecksTestModule {}

describe('AppComponent update checks', () => {
  let app: any;
  let stable: Subject<boolean>;
  let events: Subject<unknown>;
  let check: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [UpdateChecksTestModule] });
    vi.useFakeTimers();
    stable = new Subject();
    events = new Subject();
    check = vi.fn().mockResolvedValue(false);
    // Exercise the root's update lifecycle without bootstrapping wallet/network services.
    app = Object.assign(Object.create(AppComponent.prototype), {
      appRef: { isStable: stable },
      destroyRef: TestBed.inject(DestroyRef),
      updates: { isEnabled: true, versionUpdates: events, checkForUpdate: check },
      versionClicks: new Subject<void>(),
      updateCheckInFlight: false,
      updateAvailable: false,
      showAboutOverlay: false,
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('checks at startup and hourly only after the first stable emission', async () => {
    app.initializeUpdateChecks();
    expect(check).toHaveBeenCalledTimes(1);
    stable.next(false);
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(check).toHaveBeenCalledTimes(1);
    stable.next(true);
    await vi.advanceTimersByTimeAsync(3_599_999);
    expect(check).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(check).toHaveBeenCalledTimes(2);
    stable.next(true);
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(check).toHaveBeenCalledTimes(3);
  });

  it('opens About immediately and checks 60 seconds after the last click', async () => {
    app.initializeUpdateChecks();
    app.openAboutOverlay();
    expect(app.showAboutOverlay).toBe(true);
    await vi.advanceTimersByTimeAsync(59_000);
    app.closeAboutOverlay();
    app.openAboutOverlay();
    expect(app.showAboutOverlay).toBe(true);
    await vi.advanceTimersByTimeAsync(59_999);
    expect(check).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(check).toHaveBeenCalledTimes(2);
    app.openAboutOverlay();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(check).toHaveBeenCalledTimes(3);
  });

  it('deduplicates startup, hourly and click checks and recovers after failure', async () => {
    let reject: (error: Error) => void;
    check.mockReturnValueOnce(new Promise((_, fail) => { reject = fail; }));
    const log = vi.spyOn(console, 'debug').mockImplementation(() => {});
    app.initializeUpdateChecks();
    stable.next(true);
    app.openAboutOverlay();
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(check).toHaveBeenCalledTimes(1);
    reject!(new Error('offline'));
    await Promise.resolve();
    expect(log).toHaveBeenCalled();
    app.openAboutOverlay();
    expect(app.showAboutOverlay).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(check).toHaveBeenCalledTimes(2);
    expect(app.updateAvailable).toBe(false);
  });

  it('shows the banner only for VERSION_READY', async () => {
    check.mockResolvedValue(true);
    app.initializeUpdateChecks();
    await Promise.resolve();
    events.next({ type: 'VERSION_DETECTED', version: { hash: 'new' } });
    expect(app.updateAvailable).toBe(false);
    events.next({ type: 'VERSION_READY', currentVersion: { hash: 'old' }, latestVersion: { hash: 'new' } });
    expect(app.updateAvailable).toBe(true);
  });

  it('does nothing when service workers are disabled', async () => {
    app.updates.isEnabled = false;
    app.initializeUpdateChecks();
    stable.next(true);
    app.openAboutOverlay();
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(app.showAboutOverlay).toBe(true);
    expect(check).not.toHaveBeenCalled();
  });

  it('cleans up pending click and hourly timers on destruction', async () => {
    app.initializeUpdateChecks();
    stable.next(true);
    app.openAboutOverlay();
    TestBed.resetTestingModule();
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(check).toHaveBeenCalledTimes(1);
  });
});
