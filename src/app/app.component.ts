import { Component, ElementRef, HostListener, OnInit, ViewChild, Renderer2, Injector, inject, ChangeDetectionStrategy } from '@angular/core';
import {Title} from '@angular/platform-browser';
import {WalletService} from './services/wallet.service';
import {AddressBookService} from './services/address-book.service';
import {AppSettingsService} from './services/app-settings.service';
import {WebsocketService} from './services/websocket.service';
import {PriceService} from './services/price.service';
import {UtilService} from './services/util.service';
import {NotificationService} from './services/notification.service';
import {WorkPoolService} from './services/work-pool.service';
import {Router} from '@angular/router';
import {SwUpdate, VersionReadyEvent, VersionInstallationFailedEvent} from '@angular/service-worker';
import {filter} from 'rxjs/operators';
import {RepresentativeService} from './services/representative.service';
import {NodeService} from './services/node.service';
import { DesktopService, LedgerService } from './services';
import { environment } from 'environments/environment';
import { DeeplinkService } from './services/deeplink.service';
import { TranslocoService } from '@jsverse/transloco';
import { version } from 'environments/version';
import { TestIds } from './testing/test-ids';
import { E2eUnlockBridgeService } from './services/e2e-unlock-bridge.service';
import { branding } from 'environments/branding';
import { PowRoutingService } from './services/pow-routing.service';
import { STARTUP_RUNTIME_ADAPTERS, StartupService } from './services/startup.service';


@Component({
  standalone: false,
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./app.component.less']
})
export class AppComponent implements OnInit {
  walletService = inject(WalletService);
  private addressBook = inject(AddressBookService);
  settings = inject(AppSettingsService);
  private websocket = inject(WebsocketService);
  private notifications = inject(NotificationService);
  nodeService = inject(NodeService);
  private representative = inject(RepresentativeService);
  private router = inject(Router);
  updates = inject(SwUpdate);
  private workPool = inject(WorkPoolService);
  private powRouting = inject(PowRoutingService);
  readonly startup = inject(StartupService);
  private startupAdapters = inject(STARTUP_RUNTIME_ADAPTERS);
  price = inject(PriceService);
  private util = inject(UtilService);
  private desktop = inject(DesktopService);
  private ledger = inject(LedgerService);
  private renderer = inject(Renderer2);
  private deeplinkService = inject(DeeplinkService);
  private translate = inject(TranslocoService);
  private titleService = inject(Title);
  private injector = inject(Injector);
  // Instantiation deliberately registers the narrow E2E-only unlock bridge.
  private e2eUnlockBridge = inject(E2eUnlockBridgeService);

  readonly testIds = TestIds;
  readonly featureNanonyms = FEATURE_NANONYMS;
  readonly branding = branding;
  updateAvailable = false;
  updateApplying = false;

  constructor() {
      const router = this.router;

      router.events.subscribe(() => {
        this.closeNav();
      });

      this.titleService.setTitle(branding.applicationName);
    }

  @ViewChild('selectButton') selectButton: ElementRef;
  @ViewChild('accountsDropdown') accountsDropdown: ElementRef;

  node = this.nodeService.node;
  nanoPrice = this.price.price;
  totalBalance$ = this.walletService.totalBalance$;
  totalBalanceFiat$ = this.walletService.totalBalanceFiat$;
  fiatTimeout = 5 * 60 * 1000; // Update fiat prices every 5 minutes
  inactiveSeconds = 0;
  innerWidth = 0;
  innerHeight = 0;
  innerHeightWithoutMobileBar = 0;
  navExpanded = false;
  navAnimating = false;
  showAccountsDropdown = false;
  canToggleLightMode = true;
  searchData = '';
  isConfigured = this.walletService.isConfigured;
  donationAccount = environment.donationAddress;
  public appVersion = version;
  showAboutOverlay = false;

  openAboutOverlay(): void {
    this.showAboutOverlay = true;
  }

  closeAboutOverlay(): void {
    this.showAboutOverlay = false;
  }

  readonly websocketConnectionState$ = this.websocket.connectionState$;
  readonly websocketSubscriptionState$ = this.websocket.subscriptionState$;

  @HostListener('window:resize', ['$event']) onResize (e) {
    this.onWindowResize(e.target);
  }

  @HostListener('document:mousedown', ['$event']) onGlobalClick(event): void {
    if (
            ( this.selectButton.nativeElement.contains(event.target) === false )
          && ( this.accountsDropdown.nativeElement.contains(event.target) === false )
      ) {
        this.showAccountsDropdown = false;
    }
  }

  async ngOnInit() {
    await this.startup.runPhase('runtime', () => this.onWindowResize(window));

    await this.startup.runPhase('settings', async () => {
      this.settings.loadAppSettings();
      this.powRouting.syncFromSettings();
      await this.powRouting.resolveRoute().catch((error) => {
        console.debug('PoW route resolution failed:', error);
      });
      this.checkTestnetParameter();
      this.updateAppTheme();
      await this.patchXrbToNanoPrefixData();
      this.translate.setActiveLang(this.settings.settings.language);
    });

    await this.startup.runPhase('cache', () => {
      this.addressBook.loadAddressBook();
      this.workPool.loadWorkCache();
    });

    await this.startup.runPhase('wallet', async () => {
      await this.walletService.loadStoredWallet();
      for (const entry of this.addressBook.addressBook) {
        if (entry.trackTransactions) this.walletService.trackAddress(entry.account);
      }

      if (this.walletService.isConfigured() && (window.location.pathname === '/' || window.location.pathname.endsWith('index.html'))) {
        if (this.walletService.walletState.selectedAccountId) {
          this.router.navigate([`account/${this.walletService.walletState.selectedAccountId}`], { queryParams: {'compact': 1}, replaceUrl: true });
        } else {
          this.router.navigate(['accounts'], { replaceUrl: true });
        }
      }
      if (this.walletService.walletState.selectedAccountId) {
        this.walletService.selectAccount(this.walletService.walletState.selectedAccountId);
      }
      try {
        await this.walletService.refreshWalletState('startup');
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        this.startup.reportNetwork('failed', `Wallet refresh: ${reason}`);
        console.debug('Wallet startup refresh failed; continuing with hydrated wallet.', reason);
      }
    });

    await this.startup.runPhase('features', async () => {
      if (FEATURE_NANONYMS) {
        try {
          const { NanoNymManagerService } = require('./services/nanonym-manager.service');
          const manager = this.injector.get(NanoNymManagerService) as { startMonitoringAll(): Promise<void> };
          if (this.startupAdapters.nostrStart) await this.startupAdapters.nostrStart();
          await manager.startMonitoringAll();
        } catch (e) { /* NanoNym manager not available */ }
      }

      const path = localStorage.getItem('path');
      if (path) {
        const search = localStorage.getItem('query');
        const fragment = localStorage.getItem('fragment');
        localStorage.removeItem('path');
        localStorage.removeItem('query');
        localStorage.removeItem('fragment');
        if (search && search.length) {
          const queryParams = {};
          new URLSearchParams(search).forEach((value, key) => queryParams[key] = value);
          this.router.navigate([path], { queryParams, replaceUrl: true });
        } else if (fragment && fragment.length) {
          this.router.navigate([path], { fragment, replaceUrl: true });
        } else {
          this.router.navigate([path], { replaceUrl: true });
        }
      }
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
      if (this.walletService.isLocked() && this.walletService.hasPendingTransactions() && this.settings.settings.pendingOption !== 'manual') {
        this.notifications.sendWarning(`New incoming transaction(s) - Unlock the wallet to receive`, { length: 10000, identifier: 'pending-locked' });
      } else if (this.walletService.hasPendingTransactions() && this.settings.settings.pendingOption === 'manual') {
        this.notifications.sendWarning(`Incoming transaction(s) found - Set to be received manually`, { length: 10000, identifier: 'pending-locked' });
      }

      window.addEventListener('beforeunload', () => {
        if (!this.walletService.isLocked()) this.walletService.lockWallet();
      });
      window.addEventListener('unload', () => {
        if (!this.walletService.isLocked()) this.walletService.lockWallet();
      });

      this.desktop.on('deeplink', (e, deeplink) => {
        if (!this.deeplinkService.navigate(deeplink)) this.notifications.sendWarning('This URI has an invalid address.', { length: 5000 });
      });
      this.desktop.send('deeplink-ready');

      this.updates.versionUpdates.pipe(filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY')).subscribe((event) => {
        console.log(`SW update available. Current: ${event.currentVersion.hash}. New: ${event.latestVersion.hash}`);
        this.updateAvailable = true;
      });
      if (this.updates.isEnabled) this.updates.checkForUpdate().catch((err) => console.debug('SW update check failed:', err));
      this.updates.versionUpdates.pipe(filter((evt): evt is VersionInstallationFailedEvent => evt.type === 'VERSION_INSTALLATION_FAILED')).subscribe((event) => {
        console.error(`SW update failed: ${event.error}`);
      });

      setInterval(() => {
        this.inactiveSeconds += 1;
        if (!this.settings.settings.lockInactivityMinutes || this.walletService.isLocked() || !this.walletService.hasPassword()) return;
        if (this.inactiveSeconds >= this.settings.settings.lockInactivityMinutes * 60) {
          this.walletService.lockWallet();
          this.notifications.sendSuccess(`Wallet locked after ${this.settings.settings.lockInactivityMinutes} minutes of inactivity`);
        }
      }, 1000);

      if (this.settings.settings.serverAPI) {
        try {
          await this.updateFiatPrices();
        } catch (err) {
          this.notifications.sendWarning(`There was an issue retrieving latest nano price.  Ensure your AdBlocker is disabled on this page then reload to see accurate FIAT values.`, { length: 0, identifier: `price-adblock` });
        }
      }
    });
  }

  onWindowResize(windowObject) {
    this.innerWidth = windowObject.innerWidth;
    this.innerHeight = windowObject.innerHeight;

    const isMobileBarVisible = (this.innerWidth < 940);

    if (isMobileBarVisible === true) {
      this.innerHeightWithoutMobileBar = this.innerHeight - 50;
    } else {
      this.innerHeightWithoutMobileBar = this.innerHeight;
    }
  }

  /*
    This is important as it looks through saved data using hardcoded xrb_ prefixes
    (Your wallet, address book, rep list, etc) and updates them to nano_ prefix for v19 RPC
   */
  async patchXrbToNanoPrefixData() {
    // If wallet is version 2, data has already been patched.  Otherwise, patch all data
    if (this.settings.settings.walletVersion >= 2) return;

    await this.walletService.patchOldSavedData(); // Change saved xrb_ addresses to nano_
    this.addressBook.patchXrbPrefixData();
    this.representative.patchXrbPrefixData();

    this.settings.setAppSetting('walletVersion', 2); // Update wallet version so we do not patch in the future.
  }

  applySwUpdate() {
    this.updateApplying = true;
    this.updates.activateUpdate().then(() => window.location.reload());
  }

  toggleNav() {
    this.navExpanded = !this.navExpanded;
    this.onNavExpandedChange();
  }

  closeNav() {
    if (this.navExpanded === false) {
      return;
    }

    this.navExpanded = false;
    this.onNavExpandedChange();
  }

  onNavExpandedChange() {
    this.navAnimating = true;
    setTimeout(() => { this.navAnimating = false; }, 350);
  }

  toggleLightMode() {
    if (this.canToggleLightMode === false) {
      return;
    }

    this.canToggleLightMode = false;
    setTimeout(() => { this.canToggleLightMode = true; }, 300);

    this.settings.setAppSetting('lightModeEnabled', !this.settings.settings.lightModeEnabled);
    this.updateAppTheme();
  }

  updateAppTheme() {
    if (this.settings.settings.lightModeEnabled) {
      this.renderer.addClass(document.body, 'light-mode');
      this.renderer.removeClass(document.body, 'dark-mode');
    } else {
      this.renderer.addClass(document.body, 'dark-mode');
      this.renderer.removeClass(document.body, 'light-mode');
    }
  }

  toggleAccountsDropdown() {
    if (this.showAccountsDropdown === true) {
      this.showAccountsDropdown = false;
      return;
    }

    this.showAccountsDropdown = true;
    this.accountsDropdown.nativeElement.scrollTop = 0;
  }

  selectAccount(account) {
    // note: account is null when user is switching to 'Total Balance'
    this.walletService.selectAccount(account ? account.id : null);
    this.toggleAccountsDropdown();
    this.walletService.saveWalletExport();
  }

  quickReceive(account) {
    if (!account) return;
    this.walletService.selectAccount(account.id);
    this.walletService.saveWalletExport();
    this.showAccountsDropdown = false;
    this.router.navigate(['/receive'], { queryParams: { account: account.id } });
  }

  performSearch() {
    const searchData = this.searchData.trim();
    if (!searchData.length) return;

    const isValidNanoAccount = (
        ( searchData.startsWith('xrb_') || searchData.startsWith('nano_') )
      && this.util.account.isValidAccount(searchData)
    );

    if (isValidNanoAccount === true) {
      this.router.navigate(['account', searchData]);
      this.searchData = '';
      return;
    }

    const isValidBlockHash = this.util.nano.isValidHash(searchData);

    if (isValidBlockHash === true) {
      const blockHash = searchData.toUpperCase();
      this.router.navigate(['transaction', blockHash]);
      this.searchData = '';
      return;
    }

    this.notifications.sendWarning(`Invalid nano address or block hash! Please double check your input`);
  }

  updateIdleTime() {
    this.inactiveSeconds = 0; // Action has happened, reset the inactivity timer
  }

  retryConnection() {
    if (!this.settings.settings.serverAPI) {
      this.notifications.sendInfo(`Wallet server settings is set to offline mode. Please change server first!`);
      return;
    }
    this.walletService.refreshWalletState('reconnect');
    this.notifications.sendInfo(`Attempting to reconnect to nano node`);
  }

  async updateFiatPrices() {
    const displayCurrency = this.settings.getAppSetting(`displayCurrency`) || 'USD';
    await this.price.getPrice(displayCurrency);
    this.walletService.reloadFiatBalances();
    setTimeout(() => this.updateFiatPrices(), this.fiatTimeout);
  }

  /**
   * Check for testnet URL parameter and switch to testnet mode if present.
   * Hidden feature: ?testnet=true or ?testnet=1
   */
  checkTestnetParameter() {
    const urlParams = new URLSearchParams(window.location.search);
    const testnetParam = urlParams.get('testnet');

    if (testnetParam === 'true' || testnetParam === '1') {
      const currentServer = this.settings.settings.serverName;

      // Only switch if not already on testnet
      if (currentServer !== 'testnet') {
        console.log('Testnet mode activated via URL parameter');
        this.settings.setAppSetting('serverName', 'testnet');
        this.settings.loadServerSettings();
        this.notifications.sendInfo('Testnet mode enabled - Connected to local testnet node (port 17076)');
      }
    }
  }
}
