import { DestroyRef, Injectable, Injector, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { AddressBookService } from './address-book.service';
import { AppSettingsService } from './app-settings.service';
import { AudioFeedbackService } from './audio-feedback.service';
import { DeeplinkService } from './deeplink.service';
import { DesktopService } from './desktop.service';
import { NotificationService } from './notification.service';
import { PowRoutingService } from './pow-routing.service';
import { PriceService } from './price.service';
import { RepresentativeService } from './representative.service';
import { STARTUP_RUNTIME_ADAPTERS, StartupService } from './startup.service';
import { ThemeService } from './theme.service';
import { WalletService } from './wallet.service';
import { WebsocketService } from './websocket.service';
import { WorkPoolService } from './work-pool.service';

export interface AppStartupHooks {
  /** Keeps viewport measurements owned by the root view that renders them. */
  onResize(): void;
  /** Service-worker update state is tied to the root view's overlay and DestroyRef. */
  initializeUpdateChecks(): void;
}

/** Owns startup sequencing and the application-wide lifecycle work it starts. */
@Injectable({ providedIn: 'root' })
export class AppStartupCoordinatorService {
  private readonly startup = inject(StartupService);
  private readonly startupAdapters = inject(STARTUP_RUNTIME_ADAPTERS);
  private readonly wallet = inject(WalletService);
  private readonly addressBook = inject(AddressBookService);
  private readonly settings = inject(AppSettingsService);
  private readonly audio = inject(AudioFeedbackService);
  private readonly powRouting = inject(PowRoutingService);
  private readonly theme = inject(ThemeService);
  private readonly translate = inject(TranslocoService);
  private readonly workPool = inject(WorkPoolService);
  private readonly router = inject(Router);
  private readonly representative = inject(RepresentativeService);
  private readonly websocket = inject(WebsocketService);
  private readonly notifications = inject(NotificationService);
  private readonly desktop = inject(DesktopService);
  private readonly deeplink = inject(DeeplinkService);
  private readonly price = inject(PriceService);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private inactiveSeconds = 0;
  private readonly fiatRefreshInterval = 5 * 60 * 1000;

  async start(hooks: AppStartupHooks): Promise<void> {
    await this.startup.runPhase('runtime', hooks.onResize);

    await this.startup.runPhase('settings', async () => {
      this.settings.loadAppSettings();
      this.audio.syncPreference();
      this.powRouting.syncFromSettings();
      await this.powRouting.resolveRoute().catch((error) => {
        console.debug('PoW route resolution failed:', error);
      });
      this.checkTestnetParameter();
      this.theme.start();
      await this.patchXrbToNanoPrefixData();
      this.translate.setActiveLang(this.settings.settings.language);
    });

    await this.startup.runPhase('cache', () => {
      this.addressBook.loadAddressBook();
      this.workPool.loadWorkCache();
    });

    await this.startup.runPhase('wallet', async () => {
      await this.wallet.loadStoredWallet();
      for (const entry of this.addressBook.addressBook) {
        if (entry.trackTransactions) this.wallet.trackAddress(entry.account);
      }

      if (this.wallet.isConfigured() && (window.location.pathname === '/' || window.location.pathname.endsWith('index.html'))) {
        if (this.wallet.walletState.selectedAccountId) {
          this.router.navigate([`account/${this.wallet.walletState.selectedAccountId}`], { queryParams: { compact: 1 }, replaceUrl: true });
        } else {
          this.router.navigate(['accounts'], { replaceUrl: true });
        }
      }
      if (this.wallet.walletState.selectedAccountId) {
        this.wallet.selectAccount(this.wallet.walletState.selectedAccountId);
      }
      try {
        await this.wallet.refreshWalletState('startup');
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        this.startup.reportNetwork('failed', `Wallet refresh: ${reason}`);
        console.debug('Wallet startup refresh failed; continuing with hydrated wallet.', reason);
      }
    });

    await this.startup.runPhase('features', async () => {
      if (FEATURE_NANONYMS) {
        try {
          const { NanoNymManagerService } = require('./nanonym-manager.service');
          const manager = this.injector.get(NanoNymManagerService) as { startMonitoringAll(): Promise<void> };
          if (this.startupAdapters.nostrStart) await this.startupAdapters.nostrStart();
          await manager.startMonitoringAll();
        } catch { /* NanoNym manager is optional in NaultCore. */ }
      }

      this.restoreDeferredNavigation();
      this.representative.loadRepresentativeList();
    });

    await this.startup.runPhase('network', async () => {
      this.websocket.connectionState$.subscribe((state) => {
        if (state === 'open') this.startup.reportNetwork('ready');
        else if (state === 'connecting' || state === 'reconnecting') this.startup.reportNetwork('connecting');
        else if (state === 'error' || state === 'closed') this.startup.reportNetwork('failed', state);
        else this.startup.reportNetwork('unavailable', state);
      });
      this.startup.reportNetwork('connecting');
      if (this.startupAdapters.httpReady) {
        try {
          await this.startupAdapters.httpReady();
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          this.startup.reportNetwork('failed', `HTTP adapter: ${reason}`);
        }
      }
      try {
        if (this.startupAdapters.websocketConnect) this.startupAdapters.websocketConnect();
        else this.websocket.connect();
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        this.startup.reportNetwork('failed', `WebSocket adapter: ${reason}`);
      }
    });

    await this.startup.runPhase('readiness', async () => {
      this.notifyPendingTransactions();
      window.addEventListener('beforeunload', this.lockWalletBeforeUnload);
      window.addEventListener('unload', this.lockWalletBeforeUnload);
      this.desktop.on('deeplink', (_event, deeplink) => {
        if (!this.deeplink.navigate(deeplink)) this.notifications.sendWarning('This URI has an invalid address.', { length: 5000 });
      });
      this.desktop.send('deeplink-ready');

      hooks.initializeUpdateChecks();
      this.startInactivityLock();
      if (this.settings.settings.serverAPI) {
        try {
          await this.updateFiatPrices();
        } catch {
          this.notifications.sendWarning('There was an issue retrieving latest nano price.  Ensure your AdBlocker is disabled on this page then reload to see accurate FIAT values.', { length: 0, identifier: 'price-adblock' });
        }
      }
    });
  }

  resetIdleTime(): void {
    this.inactiveSeconds = 0;
  }

  private readonly lockWalletBeforeUnload = (): void => {
    if (!this.wallet.isLocked()) this.wallet.lockWallet();
  };

  private startInactivityLock(): void {
    const timer = setInterval(() => {
      this.inactiveSeconds += 1;
      if (!this.settings.settings.lockInactivityMinutes || this.wallet.isLocked() || !this.wallet.hasPasswordProtectedWallet()) return;
      if (this.inactiveSeconds >= this.settings.settings.lockInactivityMinutes * 60) {
        this.wallet.lockWallet();
        this.notifications.sendSuccess(`Wallet locked after ${this.settings.settings.lockInactivityMinutes} minutes of inactivity`, { identifier: 'wallet-locked' });
      }
    }, 1000);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  private notifyPendingTransactions(): void {
    if (this.wallet.isLocked() && this.wallet.hasPendingTransactions() && this.settings.settings.pendingOption !== 'manual') {
      this.notifications.sendWarning('New incoming transaction(s) - ', { action: 'unlock-wallet', length: 10000, identifier: 'pending-locked' });
    } else if (this.wallet.hasPendingTransactions() && this.settings.settings.pendingOption === 'manual') {
      this.notifications.sendWarning('Incoming transaction(s) found - Set to be received manually', { length: 10000, identifier: 'pending-locked' });
    }
  }

  private restoreDeferredNavigation(): void {
    const path = localStorage.getItem('path');
    if (!path) return;
    const search = localStorage.getItem('query');
    const fragment = localStorage.getItem('fragment');
    localStorage.removeItem('path');
    localStorage.removeItem('query');
    localStorage.removeItem('fragment');
    if (search?.length) {
      const queryParams: Record<string, string> = {};
      new URLSearchParams(search).forEach((value, key) => queryParams[key] = value);
      this.router.navigate([path], { queryParams, replaceUrl: true });
    } else if (fragment?.length) {
      this.router.navigate([path], { fragment, replaceUrl: true });
    } else {
      this.router.navigate([path], { replaceUrl: true });
    }
  }

  private async updateFiatPrices(): Promise<void> {
    const displayCurrency = this.settings.getAppSetting('displayCurrency') || 'USD';
    await this.price.getPrice(displayCurrency);
    this.wallet.reloadFiatBalances();
    setTimeout(() => void this.updateFiatPrices(), this.fiatRefreshInterval);
  }

  private async patchXrbToNanoPrefixData(): Promise<void> {
    if (this.settings.settings.walletVersion >= 2) return;
    await this.wallet.patchOldSavedData();
    this.addressBook.patchXrbPrefixData();
    this.representative.patchXrbPrefixData();
    this.settings.setAppSetting('walletVersion', 2);
  }

  private checkTestnetParameter(): void {
    const testnetParam = new URLSearchParams(window.location.search).get('testnet');
    if (testnetParam !== 'true' && testnetParam !== '1') return;
    if (this.settings.settings.serverName === 'testnet') return;
    console.log('Testnet mode activated via URL parameter');
    this.settings.setAppSetting('serverName', 'testnet');
    this.settings.loadServerSettings();
    this.notifications.sendInfo('Testnet mode enabled - Connected to local testnet node (port 17076)');
  }
}
