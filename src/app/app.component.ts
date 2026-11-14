import { Component, ElementRef, HostListener, OnInit, ViewChild, inject, ChangeDetectionStrategy, ApplicationRef, DestroyRef } from '@angular/core';
import {Title} from '@angular/platform-browser';
import {WalletService} from './services/wallet.service';
import {AppSettingsService, AppearanceMode} from './services/app-settings.service';
import {WebsocketService} from './services/websocket.service';
import {PriceService} from './services/price.service';
import {UtilService} from './services/util.service';
import {NotificationService} from './services/notification.service';
import {ThemeService} from './services/theme.service';
import {Router} from '@angular/router';
import {SwUpdate} from '@angular/service-worker';
import {debounceTime, first, switchMap} from 'rxjs/operators';
import {Subject, interval} from 'rxjs';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {NodeService} from './services/node.service';
import { environment } from 'environments/environment';
import { version } from 'environments/version';
import { TestIds } from './testing/test-ids';
import { E2eUnlockBridgeService } from './services/e2e-unlock-bridge.service';
import { branding } from 'environments/branding';
import { WalletContextService } from './services/wallet-context.service';
import { AppStartupCoordinatorService } from './services/app-startup-coordinator.service';


@Component({
  standalone: false,
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./app.component.less']
})
export class AppComponent implements OnInit {
  walletService = inject(WalletService);
  settings = inject(AppSettingsService);
  private websocket = inject(WebsocketService);
  private notifications = inject(NotificationService);
  nodeService = inject(NodeService);
  private router = inject(Router);

  get walletSectionActive(): boolean {
    return ['/wallet', '/accounts'].some(path => this.router.isActive(path, {
      paths: 'exact', queryParams: 'ignored', fragment: 'ignored', matrixParams: 'ignored'
    }));
  }

  updates = inject(SwUpdate);
  private appRef = inject(ApplicationRef);
  private destroyRef = inject(DestroyRef);
  private readonly versionClicks = new Subject<void>();
  private updateCheckInFlight = false;
  theme = inject(ThemeService);
  private startupCoordinator = inject(AppStartupCoordinatorService);
  private walletContext = inject(WalletContextService);
  price = inject(PriceService);
  private util = inject(UtilService);
  private titleService = inject(Title);
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
    this.versionClicks.next();
  }

  private initializeUpdateChecks(): void {
    if (!this.updates.isEnabled) return;

    this.updates.versionUpdates.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      if (event.type === 'VERSION_READY') {
        console.log(`SW update available. Current: ${event.currentVersion.hash}. New: ${event.latestVersion.hash}`);
        this.updateAvailable = true;
      } else if (event.type === 'VERSION_INSTALLATION_FAILED') {
        console.error(`SW update failed: ${event.error}`);
      }
    });
    this.versionClicks.pipe(
      debounceTime(60 * 1000),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(() => void this.checkForUpdate());
    this.appRef.isStable.pipe(
      first(stable => stable),
      switchMap(() => interval(60 * 60 * 1000)),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(() => void this.checkForUpdate());
    void this.checkForUpdate();
  }

  private async checkForUpdate(): Promise<void> {
    if (this.updateCheckInFlight) return;
    this.updateCheckInFlight = true;
    try {
      await this.updates.checkForUpdate();
    } catch (error) {
      console.debug('SW update check failed:', error);
    } finally {
      this.updateCheckInFlight = false;
    }
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
    await this.startupCoordinator.start({
      onResize: () => this.onWindowResize(window),
      initializeUpdateChecks: () => this.initializeUpdateChecks(),
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
    this.startupCoordinator.resetIdleTime();
  }

  retryConnection() {
    if (!this.settings.settings.serverAPI) {
      this.notifications.sendInfo(`Wallet server settings is set to offline mode. Please change server first!`);
      return;
    }
    this.walletService.refreshWalletState('reconnect');
    this.notifications.sendInfo(`Attempting to reconnect to nano node`);
  }

}
