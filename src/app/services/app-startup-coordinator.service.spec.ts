import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { BehaviorSubject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AddressBookService } from './address-book.service';
import { AppSettingsService } from './app-settings.service';
import { AudioFeedbackService } from './audio-feedback.service';
import { DeeplinkService } from './deeplink.service';
import { DesktopService } from './desktop.service';
import { NotificationService } from './notification.service';
import { PowRoutingService } from './pow-routing.service';
import { PriceService } from './price.service';
import { RepresentativeService } from './representative.service';
import { STARTUP_RUNTIME_ADAPTERS, StartupRuntimeAdapters, StartupService } from './startup.service';
import { ThemeService } from './theme.service';
import { WalletService } from './wallet.service';
import { WebsocketService } from './websocket.service';
import { WorkPoolService } from './work-pool.service';
import { AppStartupCoordinatorService } from './app-startup-coordinator.service';

function setup(adapters: StartupRuntimeAdapters = {}) {
  const startup = new StartupService();
  const events: string[] = [];
  const wallet = {
    walletState: { selectedAccountId: null },
    isConfigured: vi.fn(() => false),
    loadStoredWallet: vi.fn(async () => { events.push('wallet.load'); }),
    trackAddress: vi.fn((account: string) => { events.push(`wallet.track:${account}`); }),
    selectAccount: vi.fn(),
    refreshWalletState: vi.fn(async () => { events.push('wallet.refresh'); }),
    isLocked: vi.fn(() => true),
    hasPendingTransactions: vi.fn(() => false),
    hasPasswordProtectedWallet: vi.fn(() => false),
    lockWallet: vi.fn(),
    patchOldSavedData: vi.fn(async () => { events.push('wallet.patch'); }),
    reloadFiatBalances: vi.fn(),
  };
  const settings = {
    settings: { language: 'en', walletVersion: 2, serverName: 'default', serverAPI: false, pendingOption: 'manual', lockInactivityMinutes: 0, powSource: 'local' },
    loadAppSettings: vi.fn(() => { events.push('settings.load'); }),
    setAppSetting: vi.fn(),
    loadServerSettings: vi.fn(),
    getAppSetting: vi.fn(() => 'USD'),
  };
  const addressBook = {
    addressBook: [{ account: 'tracked-account', trackTransactions: true }],
    loadAddressBook: vi.fn(() => { events.push('address-book.load'); }),
    patchXrbPrefixData: vi.fn(),
  };
  const websocketState = new BehaviorSubject('closed');
  const mocks = {
    startup,
    events,
    wallet,
    settings,
    addressBook,
    audio: { syncPreference: vi.fn(() => events.push('audio.sync')) },
    pow: {
      syncFromSettings: vi.fn(() => events.push('pow.sync')),
      resolveRoute: vi.fn(async () => { events.push('pow.resolve'); return 'local'; }),
    },
    theme: { start: vi.fn(() => events.push('theme.start')) },
    translate: { setActiveLang: vi.fn((lang: string) => events.push(`translate:${lang}`)) },
    workPool: { loadWorkCache: vi.fn(() => events.push('work-cache.load')) },
    router: { navigate: vi.fn() },
    representative: {
      loadRepresentativeList: vi.fn(() => events.push('representatives.load')),
      patchXrbPrefixData: vi.fn(),
    },
    websocket: { connectionState$: websocketState, connect: vi.fn(() => events.push('websocket.connect')) },
    notifications: { sendWarning: vi.fn(), sendInfo: vi.fn(), sendSuccess: vi.fn() },
    desktop: { on: vi.fn(), send: vi.fn() },
    deeplink: { navigate: vi.fn(() => true) },
    price: { getPrice: vi.fn(async () => { events.push('price.get'); }) },
    injector: { get: vi.fn(() => ({ startMonitoringAll: vi.fn() })) },
  };

  TestBed.configureTestingModule({ providers: [
    AppStartupCoordinatorService,
    { provide: StartupService, useValue: startup },
    { provide: STARTUP_RUNTIME_ADAPTERS, useValue: adapters },
    { provide: WalletService, useValue: wallet },
    { provide: AppSettingsService, useValue: settings },
    { provide: AddressBookService, useValue: addressBook },
    { provide: AudioFeedbackService, useValue: mocks.audio },
    { provide: PowRoutingService, useValue: mocks.pow },
    { provide: ThemeService, useValue: mocks.theme },
    { provide: TranslocoService, useValue: mocks.translate },
    { provide: WorkPoolService, useValue: mocks.workPool },
    { provide: Router, useValue: mocks.router },
    { provide: RepresentativeService, useValue: mocks.representative },
    { provide: WebsocketService, useValue: mocks.websocket },
    { provide: NotificationService, useValue: mocks.notifications },
    { provide: DesktopService, useValue: mocks.desktop },
    { provide: DeeplinkService, useValue: mocks.deeplink },
    { provide: PriceService, useValue: mocks.price },
    { provide: Injector, useValue: mocks.injector },
  ] });
  return { coordinator: TestBed.inject(AppStartupCoordinatorService), mocks };
}

describe('AppStartupCoordinatorService', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  it('sequences startup workflows and records every completed phase', async () => {
    const { coordinator, mocks } = setup();
    const onResize = vi.fn(() => mocks.events.push('runtime.resize'));
    const initializeUpdateChecks = vi.fn(() => mocks.events.push('updates.initialize'));

    await coordinator.start({ onResize, initializeUpdateChecks });

    expect(mocks.events).toEqual([
      'runtime.resize', 'settings.load', 'audio.sync', 'pow.sync', 'pow.resolve',
      'theme.start', 'translate:en',
      'address-book.load', 'work-cache.load', 'wallet.load', 'wallet.track:tracked-account',
      'wallet.refresh', 'representatives.load', 'websocket.connect', 'updates.initialize',
    ]);
    expect(mocks.startup.state$.value.phases).toMatchObject({
      runtime: { status: 'complete' }, settings: { status: 'complete' }, cache: { status: 'complete' },
      wallet: { status: 'complete' }, features: { status: 'complete' }, network: { status: 'complete' },
      readiness: { status: 'complete' },
    });
    expect(onResize).toHaveBeenCalledOnce();
    expect(initializeUpdateChecks).toHaveBeenCalledOnce();
  });

  it('stops at the failed phase and leaves later startup work pending', async () => {
    const { coordinator, mocks } = setup();
    const failure = new Error('settings storage unavailable');
    mocks.settings.loadAppSettings.mockImplementation(() => { throw failure; });

    await expect(coordinator.start({ onResize: vi.fn(), initializeUpdateChecks: vi.fn() })).rejects.toBe(failure);

    expect(mocks.startup.state$.value.phases.runtime.status).toBe('complete');
    expect(mocks.startup.state$.value.phases.settings).toMatchObject({ status: 'failed', error: failure.message });
    expect(mocks.startup.state$.value.phases.cache.status).toBe('pending');
    expect(mocks.wallet.loadStoredWallet).not.toHaveBeenCalled();
  });

  it('continues through optional PoW, wallet-refresh, and network adapter failures', async () => {
    const adapters = {
      httpReady: vi.fn(async () => { throw new Error('HTTP unavailable'); }),
      websocketConnect: vi.fn(() => { throw new Error('WebSocket unavailable'); }),
    };
    const { coordinator, mocks } = setup(adapters);
    mocks.pow.resolveRoute.mockRejectedValue(new Error('local PoW unavailable'));
    mocks.wallet.refreshWalletState.mockRejectedValue(new Error('node unavailable'));
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});

    await coordinator.start({ onResize: vi.fn(), initializeUpdateChecks: vi.fn() });

    expect(mocks.startup.state$.value.phases.readiness.status).toBe('complete');
    expect(mocks.startup.state$.value.network.status).toBe('failed');
    expect(mocks.startup.state$.value.network.reason).toBe('WebSocket adapter: WebSocket unavailable');
    expect(mocks.wallet.loadStoredWallet).toHaveBeenCalledOnce();
    expect(adapters.httpReady).toHaveBeenCalledOnce();
    expect(adapters.websocketConnect).toHaveBeenCalledOnce();
    expect(debug).toHaveBeenCalled();
  });
});
