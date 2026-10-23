import { Component, ElementRef, HostListener, OnInit, ViewChild, Renderer2, Injector, inject, ChangeDetectionStrategy } from '@angular/core';
import {Title} from '@angular/platform-browser';
import {WalletService} from './services/wallet.service';
import {AddressBookService} from './services/address-book.service';
import {AppSettingsService, AppearanceMode} from './services/app-settings.service';
import {WebsocketService} from './services/websocket.service';
import {PriceService} from './services/price.service';
import {UtilService} from './services/util.service';
import {NotificationService} from './services/notification.service';
import {AudioFeedbackService} from './services/audio-feedback.service';
import {ThemeService} from './services/theme.service';
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
import { WalletContextService } from './services/wallet-context.service';


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
  private audio = inject(AudioFeedbackService);
  nodeService = inject(NodeService);
  private representative = inject(RepresentativeService);
  private router = inject(Router);
  updates = inject(SwUpdate);
  private workPool = inject(WorkPoolService);
  private powRouting = inject(PowRoutingService);
  theme = inject(ThemeService);
  readonly startup = inject(StartupService);
  private startupAdapters = inject(STARTUP_RUNTIME_ADAPTERS);
  private walletContext = inject(WalletContextService);
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

/**
   * The switch's accessible name. It carries no text of its own - the knob and
   * the caption beside it name the control - so this is the only thing telling
   * a screen reader which theme is active and what the control will do.
   */
get appearanceSwitchLabel(): string {
    const current = this.theme.resolved === 'dark' ? 'Dark' : 'Light';
    const next = this.theme.resolved === 'dark' ? 'Light' : 'Dark';
    return `Theme: ${current}. Switch to ${next}.`;
  }

  /**
   * The Auto badge shows the word rather than a glyph: a monitor icon read as
   * "a screen", not "follow the system", and the caption above no longer
   * repeats the state, so there is nothing left for the badge to be redundant
   * with.
   */
get appearanceAutoLabel(): string {
    return 'Auto: following your system appearance. Activate to switch to light.';
  }
  searchData = '';
  isConfigured = this.walletService.isConfigured;
  donationAccount = environment.donationAddress;
  public appVersion = version;
  showAboutOverlay = false;

  get mobileNavigationClosed(): boolean {
    return this.innerWidth > 0 && this.innerWidth < 940 && !this.navExpanded;
  }

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
        if (!this.settings.settings.lockInactivityMinutes || this.walletService.isLocked() || !this.walletService.hasPasswordProtectedWallet()) return;
        if (this.inactiveSeconds >= this.settings.settings.lockInactivityMinutes * 60) {
          this.walletService.lockWallet();
          this.notifications.sendSuccess(`Wallet locked after ${this.settings.settings.lockInactivityMinutes} minutes of inactivity`, { identifier: 'wallet-locked' });
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

  @HostListener('document:keydown.escape')
  closeNavigationWithEscape(): void {
    this.closeNav();
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

  /**
   * Advances the appearance preference: light -> dark -> auto -> light.
   *
   * `aria-disabled` keeps the switch focusable-by-assistive-tech conventions
   * intact but does not stop a click, so auto is refused here. Without this the
   * switch would look inert and still change the theme, and the Auto overlay
   * would not be the single way out of auto.
   */
  cycleAppearanceMode() {
    if (this.theme.followingSystem) {
      return;
    }
    const cycle: Record<AppearanceMode, AppearanceMode> = {
      light: 'dark',
      dark: 'auto',
      auto: 'light',
    };
    this.theme.setMode(cycle[this.theme.mode]);
  }

  /** Leaves Auto and resumes the cycle at light. Bound to the Auto overlay. */
  resumeFromAuto() {
    this.theme.setMode('light');
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
    this.walletContext.selectAccount(account ? account.id : null);
    this.toggleAccountsDropdown();
  }

  quickReceive(account) {
    if (!account) return;
    this.walletContext.selectAccount(account.id);
    this.showAccountsDropdown = false;
    const target = this.walletContext.transaction('receive', account.id);
    this.router.navigateByUrl(this.router.createUrlTree(target.commands, { queryParams: target.queryParams }));
  }

  requestWalletUnlockFromReceivable(event?: KeyboardEvent): void {
    event?.preventDefault();
    if (this.walletService.isLocked()) {
      void this.walletService.requestWalletUnlock();
    }
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
