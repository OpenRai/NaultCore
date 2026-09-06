import { Component, OnInit, Renderer2, inject, ChangeDetectionStrategy } from '@angular/core';
import {WalletService} from '../../services/wallet.service';
import {NotificationService} from '../../services/notification.service';
import {AppSettingsService} from '../../services/app-settings.service';
import {PriceService} from '../../services/price.service';
import {WorkPoolService} from '../../services/work-pool.service';
import {PowPolicy, PowRoutingService} from '../../services/pow-routing.service';
import {AddressBookService} from '../../services/address-book.service';
import {ApiService} from '../../services/api.service';
import {WebsocketService} from '../../services/websocket.service';
import {NodeService} from '../../services/node.service';
import {UtilService} from '../../services/util.service';
import {BehaviorSubject} from 'rxjs';
import {RepresentativeService} from '../../services/representative.service';
import {NinjaService} from '../../services/ninja.service';
import {QrModalService} from '../../services/qr-modal.service';
import { TranslocoService } from '@jsverse/transloco';
import { TestIds } from '../../testing/test-ids';
import { NanoNymManagerService } from '../../services/nanonym-manager.service';

@Component({
  standalone: false,
  selector: 'app-configure-app',
  templateUrl: './configure-app.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./configure-app.component.css']
})

export class ConfigureAppComponent implements OnInit {
  private walletService = inject(WalletService);
  private notifications = inject(NotificationService);
  private appSettings = inject(AppSettingsService);
  private addressBook = inject(AddressBookService);
  private powRouting = inject(PowRoutingService);
  private api = inject(ApiService);
  private websocket = inject(WebsocketService);
  private workPool = inject(WorkPoolService);
  private repService = inject(RepresentativeService);
  private node = inject(NodeService);
  private util = inject(UtilService);
  private price = inject(PriceService);
  private ninja = inject(NinjaService);
  private renderer = inject(Renderer2);
  private qrModalService = inject(QrModalService);
  private translocoService = inject(TranslocoService);
  private nanonymManager = inject(NanoNymManagerService);

  readonly testIds = TestIds;
  readonly featureNanonyms = FEATURE_NANONYMS;

  languages = this.translocoService.getAvailableLangs() as [{id: string, label: string}];
  selectedLanguage = this.languages[0].id;

  denominations = [
    { name: 'XNO', value: 'mnano' },
    { name: 'knano', value: 'knano' },
    { name: 'nano', value: 'nano' },
  ];
  selectedDenomination = this.denominations[0].value;

  storageOptions = [
    { name: 'configure-app.storage-options.browser-local-storage', value: 'localStorage' },
    { name: 'configure-app.storage-options.none', value: 'none' },
  ];
  selectedStorage = this.storageOptions[0].value;

  currencies = [
    { name: 'configure-app.currencies.none', value: '' },
    { name: 'USD - US Dollar', value: 'USD' },
    { name: 'BTC - Bitcoin', value: 'BTC' },
    { name: 'AUD - Australian Dollar', value: 'AUD' },
    { name: 'BRL - Brazilian Real', value: 'BRL' },
    { name: 'CAD - Canadian Dollar', value: 'CAD' },
    { name: 'CHF - Swiss Franc', value: 'CHF' },
    { name: 'CLP - Chilean Peso', value: 'CLP' },
    { name: 'CNY - Chinese Yuan', value: 'CNY' },
    { name: 'CZK - Czech Koruna', value: 'CZK' },
    { name: 'DKK - Danish Krown', value: 'DKK' },
    { name: 'EUR - Euro', value: 'EUR' },
    { name: 'GBP - British Pound', value: 'GBP' },
    { name: 'HKD - Hong Kong Dollar', value: 'HKD' },
    { name: 'HUF - Hungarian Forint', value: 'HUF' },
    { name: 'IDR - Indonesian Rupiah', value: 'IDR' },
    { name: 'ILS - Israeli New Shekel', value: 'ILS' },
    { name: 'INR - Indian Rupee', value: 'INR' },
    { name: 'JPY - Japanese Yen', value: 'JPY' },
    { name: 'KRW - South Korean Won', value: 'KRW' },
    { name: 'MXN - Mexican Peso', value: 'MXN' },
    { name: 'MYR - Malaysian Ringgit', value: 'MYR' },
    { name: 'NOK - Norwegian Krone', value: 'NOK' },
    { name: 'NZD - New Zealand Dollar', value: 'NZD' },
    { name: 'PHP - Philippine Piso', value: 'PHP' },
    { name: 'PKR - Pakistani Rupee', value: 'PKR' },
    { name: 'PLN - Polish Zloty', value: 'PLN' },
    { name: 'RUB - Russian Ruble', value: 'RUB' },
    { name: 'SEK - Swedish Krona', value: 'SEK' },
    { name: 'SGD - Singapore Dollar', value: 'SGD' },
    { name: 'THB - Thai Baht', value: 'THB' },
    { name: 'TRY - Turkish Lira', value: 'TRY' },
    { name: 'TWD - New Taiwan Dollar', value: 'TWD' },
    { name: 'ZAR - South African Rand', value: 'ZAR' },
  ];
  selectedCurrency = this.currencies[0].value;

  nightModeOptions = [
    { name: 'configure-app.night-mode-options.enabled', value: 'enabled' },
    { name: 'configure-app.night-mode-options.disabled', value: 'disabled' },
  ];
  selectedNightModeOption = this.nightModeOptions[0].value;

  identiconOptions = [
    { name: 'configure-app.identicon-options.none', value: 'none' },
    { name: 'configure-app.identicon-options.nanoidenticons-by-keerifox', value: 'nanoidenticons' },
    { name: 'configure-app.identicon-options.natricon-by-appditto', value: 'natricon' },
  ];
  selectedIdenticonOption = this.identiconOptions[0].value;

  useNostr = true;
  useOrbitDb = false;

  inactivityOptions = [
    { name: 'configure-app.identicon-options.never', value: 0 },
    { name: 'configure-app.identicon-options.1-minute', value: 1 },
    { name: 'configure-app.identicon-options.x-minutes', value: 5, params: { minutes: 5 } },
    { name: 'configure-app.identicon-options.x-minutes', value: 15, params: { minutes: 15 } },
    { name: 'configure-app.identicon-options.x-minutes', value: 30, params: { minutes: 30 } },
    { name: 'configure-app.identicon-options.1-hour', value: 60 },
    { name: 'configure-app.identicon-options.x-hours', value: 360, params: { hours: 6 } },
  ];
  selectedInactivityMinutes = this.inactivityOptions[4].value;

  powOptions: Array<{ name: string; value: PowPolicy }> = [
    { name: 'configure-app.pow-options.auto', value: 'auto' },
    { name: 'configure-app.pow-options.local', value: 'local' },
    { name: 'configure-app.pow-options.remote', value: 'remote' },
  ];
  selectedPoWOption: PowPolicy = 'auto';
  powRoutingState$ = this.powRouting.state$;

  multiplierOptions = [
    { name: 'configure-app.multiplier-options.default-1x-or-1-64x', value: 1 },
    { name: '2x', value: 2 },
    { name: '4x', value: 4 },
    { name: '8x', value: 8 },
    { name: '16x', value: 16 },
    { name: '32x', value: 32 },
    { name: '64x', value: 64 },
  ];
  selectedMultiplierOption: number = this.multiplierOptions[0].value;

  pendingOptions = [
    { name: 'configure-app.pending-options.automatic-largest-amount-first', value: 'amount' },
    { name: 'configure-app.pending-options.automatic-oldest-transaction-first', value: 'date' },
    { name: 'configure-app.pending-options.manual', value: 'manual' },
  ];
  selectedPendingOption = this.pendingOptions[0].value;

  decentralizedAliasesOptions = [
    { name: 'configure-app.decentralized-aliases-options.disabled', value: 'disabled' },
    { name: 'configure-app.decentralized-aliases-options.enabled', value: 'enabled' },
  ];
  selectedDecentralizedAliasesOption = this.decentralizedAliasesOptions[0].value;

  // prefixOptions = [
  //   { name: 'xrb_', value: 'xrb' },
  //   { name: 'nano_', value: 'nano' },
  // ];
  // selectedPrefix = this.prefixOptions[0].value;

  serverOptions = [];
  selectedServer = null;

  defaultRepresentative = null;
  representativeResults$ = new BehaviorSubject([]);
  showRepresentatives = false;
  representativeListMatch = '';
  repStatus = null;
  representativeList = [];

  serverAPI = null;
  serverAPIUpdated = null;
  serverWS = null;
  serverAuth = null;
  minimumReceive = null;

  nodeBlockCount = null;
  nodeUnchecked = null;
  nodeCemented = null;
  nodeUncemented = null;
  peersStakeReq = null;
  peersStakeTotal = null;
  nodeVendor = null;
  nodeNetwork = null;
  statsRefreshEnabled = true;
  shouldRandom = null;

  customWorkServer = '';
  customWorkServerAuth = '';

  activeServer: string | null = null;
  activeServerAPI: string | null = null;
  activeServerWS: string | null = null;
  activeServerAuth: string | null = null;
  testingServer = false;
  serverTestError: string | null = null;
  serverTestSuccess: string | null = null;

  activeWorkServer = '';
  activeWorkServerAuth = '';
  candidateWorkServer = '';
  candidateWorkServerAuth = '';
  testingWorkServer = false;
  workServerTestError: string | null = null;
  workServerTestSuccess: string | null = null;

  savedSection: 'display' | 'wallet' | 'server' | null = null;
  savedTimer: any = null;


  showServerValues = () => this.selectedServer && this.selectedServer !== 'random' && this.selectedServer !== 'offline';
  showStatValues = () => this.selectedServer && this.selectedServer !== 'offline';
  showServerConfigs = () => this.selectedServer && this.selectedServer === 'custom';

  async ngOnInit() {
    this.loadFromSettings();
    this.powRouting.syncFromSettings();
    void this.powRouting.resolveRoute();
    this.updateNodeStats();

    setTimeout(() => this.populateRepresentativeList(), 500);
  }

  async populateRepresentativeList() {
    // add trusted/regular local reps to the list
    const localReps = this.repService.getSortedRepresentatives();
    this.representativeList.push( ...localReps.filter(rep => (!rep.warn)) );

    if (this.serverAPI) {
      const verifiedReps = await this.ninja.recommendedRandomized();

      // add random recommended reps to the list
      for (const representative of verifiedReps) {
        const temprep = {
          id: representative.account,
          name: representative.alias
        };

        this.representativeList.push(temprep);
      }
    }

    // add untrusted local reps to the list
    this.representativeList.push( ...localReps.filter(rep => (rep.warn)) );
  }

  async updateNodeStats(refresh= false) {
    if ((!this.serverAPIUpdated ||
      (this.serverAPIUpdated !== this.appSettings.settings.serverAPI && this.selectedServer === 'random'))) return;
    // refresh is not enabled
    if (refresh && !this.statsRefreshEnabled) return;
    // Offline mode selected
    if (this.selectedServer === 'offline') return;

    this.statsRefreshEnabled = false;
    try {
      const blockCount = await this.api.blockCount();
      this.nodeBlockCount = Number(blockCount.count).toLocaleString('en-US');
      this.nodeUnchecked = Number(blockCount.unchecked).toLocaleString('en-US');
      this.nodeCemented = Number(blockCount.cemented).toLocaleString('en-US');
      this.nodeUncemented = Number(blockCount.count - blockCount.cemented).toLocaleString('en-US');
    } catch {console.warn('Failed to get node stats: block count'); }

    try {
      const quorumData = await this.api.confirmationQuorum();
      this.peersStakeReq = quorumData ? Number(this.util.nano.rawToMnano(quorumData.quorum_delta)).toLocaleString('en-US') : null;
      this.peersStakeTotal = quorumData ? Number(this.util.nano.rawToMnano(quorumData.peers_stake_total)).toLocaleString('en-US') : null;
    } catch {console.warn('Failed to get node stats: confirmation quorum'); }

    try {
      const version = await this.api.version();
      this.nodeVendor = version.node_vendor;
      this.nodeNetwork = version.network;
    } catch {console.warn('Failed to get node stats: version'); }

    setTimeout(() => this.statsRefreshEnabled = true, 5000);
  }

  loadFromSettings() {
    const settings = this.appSettings.settings;

    const matchingLanguage = this.languages.find(language => language.id === settings.language);
    this.selectedLanguage = matchingLanguage.id || this.languages[0].id;

    const matchingCurrency = this.currencies.find(d => d.value === settings.displayCurrency);
    this.selectedCurrency = matchingCurrency.value || this.currencies[0].value;

    const nightModeOptionString = (settings.lightModeEnabled === true) ? 'disabled' : 'enabled';
    const matchingNightModeOption = this.nightModeOptions.find(d => d.value === nightModeOptionString);
    this.selectedNightModeOption = matchingNightModeOption.value || this.nightModeOptions[0].value;

    const matchingIdenticonOptions = this.identiconOptions.find(d => d.value === settings.identiconsStyle);
    this.selectedIdenticonOption = matchingIdenticonOptions.value || this.identiconOptions[0].value;

    this.useNostr = settings.useNostr !== undefined ? settings.useNostr : true;
    this.useOrbitDb = settings.useOrbitDb || false;

    const matchingStorage = this.storageOptions.find(d => d.value === settings.walletStore);
    this.selectedStorage = matchingStorage.value || this.storageOptions[0].value;

    const matchingInactivityMinutes = this.inactivityOptions.find(d => d.value === settings.lockInactivityMinutes);
    this.selectedInactivityMinutes = matchingInactivityMinutes ? matchingInactivityMinutes.value : this.inactivityOptions[4].value;

    this.selectedPoWOption = this.powRouting.policyFromSource(settings.powSource);

    const matchingMultiplierOption = this.multiplierOptions.find(d => d.value === settings.multiplierSource);
    this.selectedMultiplierOption = matchingMultiplierOption ? matchingMultiplierOption.value : this.multiplierOptions[0].value;

    this.customWorkServer = settings.customWorkServer;
    this.customWorkServerAuth = settings.customWorkServerAuth || '';
    this.activeWorkServer = this.customWorkServer;
    this.activeWorkServerAuth = this.customWorkServerAuth;
    this.candidateWorkServer = this.customWorkServer;
    this.candidateWorkServerAuth = this.customWorkServerAuth;

    const matchingPendingOption = this.pendingOptions.find(d => d.value === settings.pendingOption);
    this.selectedPendingOption = matchingPendingOption ? matchingPendingOption.value : this.pendingOptions[0].value;

    const matchingDecentralizedAliasesOption = this.decentralizedAliasesOptions.find(d => d.value === settings.decentralizedAliasesOption);
    this.selectedDecentralizedAliasesOption = matchingDecentralizedAliasesOption ? matchingDecentralizedAliasesOption.value : this.decentralizedAliasesOptions[0].value;

    this.serverOptions = this.appSettings.serverOptions;
    this.selectedServer = settings.serverName;
    this.serverAPI = settings.serverAPI;
    this.serverAPIUpdated = this.serverAPI;
    this.serverWS = settings.serverWS;
    this.serverAuth = settings.serverAuth;
    this.activeServer = settings.serverName;
    this.activeServerAPI = settings.serverAPI;
    this.activeServerWS = settings.serverWS;
    this.activeServerAuth = settings.serverAuth;

    this.minimumReceive = settings.minimumReceive;
    this.defaultRepresentative = settings.defaultRepresentative;
    if (this.defaultRepresentative) {
      this.validateRepresentative();
    }
  }

  showSavedIndicator(section: 'display' | 'wallet' | 'server') {
    if (this.savedTimer) {
      clearTimeout(this.savedTimer);
    }
    this.savedSection = section;
    this.savedTimer = setTimeout(() => {
      this.savedSection = null;
      this.savedTimer = null;
    }, 2500);
  }


  // --- Display Settings Autosave ---
  onLanguageChange(newLang: string) {
    this.selectedLanguage = newLang;
    this.appSettings.setAppSetting('language', newLang);
    this.translocoService.setActiveLang(newLang);
    this.showSavedIndicator('display');
  }

  async onCurrencyChange(newCurrency: string) {
    this.selectedCurrency = newCurrency;
    this.appSettings.setAppSetting('displayCurrency', newCurrency);
    if (newCurrency) {
      await this.price.getPrice(newCurrency);
      this.walletService.reloadFiatBalances();
    }
    this.showSavedIndicator('display');
  }

  onNightModeChange(newMode: string) {
    this.selectedNightModeOption = newMode;
    const lightMode = newMode === 'disabled';
    if (lightMode) {
      this.renderer.addClass(document.body, 'light-mode');
      this.renderer.removeClass(document.body, 'dark-mode');
      this.appSettings.setAppSetting('lightModeEnabled', true);
    } else {
      this.renderer.addClass(document.body, 'dark-mode');
      this.renderer.removeClass(document.body, 'light-mode');
      this.appSettings.setAppSetting('lightModeEnabled', false);
    }
    // Sync Safari / Chrome PWA chrome bar to the actual in-app theme.
    const themeColor = lightMode ? '#f8f8f8' : '#22222A';
    document.querySelectorAll('meta[name="theme-color"]').forEach(el => {
      el.setAttribute('content', themeColor);
    });
    this.showSavedIndicator('display');
  }

  onIdenticonChange(newIdenticon: string) {
    this.selectedIdenticonOption = newIdenticon;
    this.appSettings.setAppSetting('identiconsStyle', newIdenticon);
    this.showSavedIndicator('display');
  }

  onNanonymChange(settingKey: 'useNostr' | 'useOrbitDb', value: boolean) {
    this[settingKey] = value;
    this.appSettings.setAppSetting(settingKey, value);
    this.showSavedIndicator('display');
  }

  async updateDisplaySettings() {
    this.onNightModeChange(this.selectedNightModeOption);
    this.onIdenticonChange(this.selectedIdenticonOption);
    this.appSettings.setAppSetting('useNostr', this.useNostr);
    this.appSettings.setAppSetting('useOrbitDb', this.useOrbitDb);
    await this.onCurrencyChange(this.selectedCurrency);
    this.onLanguageChange(this.selectedLanguage);
    this.notifications.sendSuccess(this.translocoService.translate('configure-app.app-display-settings-successfully-updated'));
  }

  async reprobePoW(): Promise<void> {
    try {
      await this.powRouting.reprobe();
    } catch {
      // The routing status exposes the diagnostic; keep the settings page usable.
    }
  }

  // --- Wallet Settings Autosave ---
  onInactivityChange(minutes: number | string) {
    const num = Number(minutes);
    this.selectedInactivityMinutes = num;
    this.appSettings.setAppSetting('lockInactivityMinutes', num);
    this.showSavedIndicator('wallet');
  }

  async onStorageChange(newStorage: string) {
    const prevStorage = this.appSettings.settings.walletStore;
    if (newStorage === prevStorage) return;

    if (newStorage === this.storageOptions[1].value) {
      const UIkit = window['UIkit'];
      try {
        if (UIkit?.modal?.confirm) {
          await UIkit.modal.confirm(
            `<p class="uk-alert uk-alert-danger"><br><span class="uk-flex"><span uk-icon="icon: warning; ratio: 3;" class="uk-align-center"></span></span>
            <span style="font-size: 18px;">
            ${ this.translocoService.translate('configure-app.you-are-about-to-disable-storage-of-all-wallet-data-which') }
            </span><br>
            ${ this.walletService.isConfigured() ? '<br><b style="font-size: 18px;">' + this.translocoService.translate('reset-wallet.before-continuing-make-sure-you-have-saved-the-nano-seed') + '</b><br><br><span style="font-size: 18px;"><b>' + this.translocoService.translate('reset-wallet.you-will-not-be-able-to-recover-the-funds-without-a-backup') + '</b></span></p><br>' : '' }`
          );
        }
      } catch (err) {
        this.selectedStorage = prevStorage;
        this.notifications.sendInfo(this.translocoService.translate('configure-app.switched-back-to-browser-local-storage-for-the-wallet-data'), {length: 10000});
        return;
      }
    }

    this.selectedStorage = newStorage;
    this.appSettings.setAppSetting('walletStore', newStorage);
    this.walletService.saveWalletExport();
    this.showSavedIndicator('wallet');
  }

  onPoWOptionChange(policy: PowPolicy) {
    this.selectedPoWOption = policy;
    if (policy !== 'local') {
      this.selectedMultiplierOption = this.multiplierOptions[0].value;
      this.appSettings.setAppSetting('multiplierSource', this.selectedMultiplierOption);
    }
    this.appSettings.setAppSetting('powSource', policy);
    this.powRouting.applyPolicy(policy);
    if (policy === 'auto') {
      void this.powRouting.resolveRoute();
    }
    this.showSavedIndicator('wallet');
  }

  async onMultiplierChange(multiplier: number | string) {
    const num = Number(multiplier);
    const prev = this.appSettings.settings.multiplierSource;
    this.selectedMultiplierOption = num;
    this.appSettings.setAppSetting('multiplierSource', num);
    if (num > prev && num > 1 && this.selectedPoWOption === 'local') {
      if (await this.clearWorkCache()) {
        this.walletService.refreshWalletState('settings-change');
      }
    }
    this.showSavedIndicator('wallet');
  }

  onPendingOptionChange(pendingOption: string) {
    const prev = this.appSettings.settings.pendingOption;
    this.selectedPendingOption = pendingOption;
    this.appSettings.setAppSetting('pendingOption', pendingOption);
    if (pendingOption !== 'manual' && pendingOption !== prev) {
      this.walletService.refreshWalletState('settings-change');
    }
    this.showSavedIndicator('wallet');
  }

  onDecentralizedAliasesChange(option: string) {
    this.selectedDecentralizedAliasesOption = option;
    this.appSettings.setAppSetting('decentralizedAliasesOption', option);
    this.showSavedIndicator('wallet');
  }

  onMinimumReceiveBlur() {
    const raw = (this.minimumReceive ?? '').toString().trim();
    if (raw === '') {
      this.minimumReceive = null;
      if (this.appSettings.settings.minimumReceive !== null) {
        this.appSettings.setAppSetting('minimumReceive', null);
        this.walletService.refreshWalletState('settings-change');
      }
      this.showSavedIndicator('wallet');
      return;
    }
    if (this.util.account.isValidNanoAmount(raw)) {
      if (this.appSettings.settings.minimumReceive !== raw) {
        this.appSettings.setAppSetting('minimumReceive', raw);
        this.walletService.refreshWalletState('settings-change');
      }
      this.showSavedIndicator('wallet');
    } else {
      this.notifications.sendWarning(this.translocoService.translate('configure-app.invalid-minimum-receive-amount'));
    }
  }

  saveDefaultRepresentative() {
    const rep = (this.defaultRepresentative ?? '').toString().trim();
    if (!rep) {
      this.defaultRepresentative = null;
      this.representativeListMatch = '';
      if (this.appSettings.settings.defaultRepresentative !== null) {
        this.appSettings.setAppSetting('defaultRepresentative', null);
      }
      this.showSavedIndicator('wallet');
      return;
    }
    if (this.util.account.isValidAccount(rep)) {
      if (this.appSettings.settings.defaultRepresentative !== rep) {
        this.appSettings.setAppSetting('defaultRepresentative', rep);
      }
      this.showSavedIndicator('wallet');
    } else {
      this.notifications.sendWarning(this.translocoService.translate('configure-app.default-representative-is-not-a-valid-account'));
    }
  }

  async updateWalletSettings() {
    await this.onStorageChange(this.selectedStorage);
    this.onInactivityChange(this.selectedInactivityMinutes);
    this.onPoWOptionChange(this.selectedPoWOption);
    await this.onMultiplierChange(this.selectedMultiplierOption);
    this.onPendingOptionChange(this.selectedPendingOption);
    this.onDecentralizedAliasesChange(this.selectedDecentralizedAliasesOption);
    this.onMinimumReceiveBlur();
    this.saveDefaultRepresentative();
    this.notifications.sendSuccess(this.translocoService.translate('configure-app.app-wallet-settings-successfully-updated'));
  }

  // --- Work Server Candidate & Activation ---
  isWorkServerCandidateDifferent(): boolean {
    const candidateServer = (this.candidateWorkServer || '').trim();
    const activeServer = (this.activeWorkServer || '').trim();
    const candidateAuth = (this.candidateWorkServerAuth || '').trim();
    const activeAuth = (this.activeWorkServerAuth || '').trim();
    return candidateServer !== activeServer || candidateAuth !== activeAuth;
  }

  async activateWorkServer(): Promise<void> {
    const url = (this.candidateWorkServer || '').trim();
    const auth = (this.candidateWorkServerAuth || '').trim();

    if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
      this.workServerTestError = this.translocoService.translate('configure-app.work-server-connection-failed');
      return;
    }

    this.testingWorkServer = true;
    this.workServerTestError = null;
    this.workServerTestSuccess = null;

    try {
      const probe = await this.api.probeWorkServer(url, auth);
      if (probe.success) {
        this.activeWorkServer = url;
        this.activeWorkServerAuth = auth;
        this.customWorkServer = url;
        this.customWorkServerAuth = auth;
        this.appSettings.setAppSetting('customWorkServer', url);
        this.appSettings.setAppSetting('customWorkServerAuth', auth);
        this.workServerTestSuccess = this.translocoService.translate('configure-app.work-server-connected-success');
        this.notifications.sendSuccess(this.workServerTestSuccess);
        this.showSavedIndicator('wallet');
      } else {
        this.workServerTestError = this.translocoService.translate('configure-app.work-server-connection-failed');
      }
    } catch {
      this.workServerTestError = this.translocoService.translate('configure-app.work-server-connection-failed');
    } finally {
      this.testingWorkServer = false;
    }
  }

  resetWorkServerToDefault(): void {
    this.activeWorkServer = '';
    this.activeWorkServerAuth = '';
    this.customWorkServer = '';
    this.customWorkServerAuth = '';
    this.candidateWorkServer = '';
    this.candidateWorkServerAuth = '';
    this.appSettings.setAppSetting('customWorkServer', '');
    this.appSettings.setAppSetting('customWorkServerAuth', '');
    this.workServerTestError = null;
    this.workServerTestSuccess = null;
    this.showSavedIndicator('wallet');
  }

  // --- Nano RPC Server Candidate & Activation ---
  getActiveServerLabel(): string {
    if (!this.activeServer) return 'None';
    if (this.activeServer === 'offline') return 'Offline';
    if (this.activeServer === 'random') return 'Random';
    const found = this.serverOptions.find(o => o.value === this.activeServer);
    return found ? found.name : this.activeServer;
  }

  isServerCandidateDifferent(): boolean {
    if (this.selectedServer !== this.activeServer) return true;
    if (this.selectedServer === 'custom') {
      const apiChanged = (this.serverAPI || '').trim() !== (this.activeServerAPI || '').trim();
      const wsChanged = (this.serverWS || '').trim() !== (this.activeServerWS || '').trim();
      const authChanged = (this.serverAuth || '').trim() !== (this.activeServerAuth || '').trim();
      return apiChanged || wsChanged || authChanged;
    }
    return false;
  }

  revertServerCandidate(): void {
    this.selectedServer = this.activeServer;
    this.serverAPI = this.activeServerAPI;
    this.serverWS = this.activeServerWS;
    this.serverAuth = this.activeServerAuth;
    this.serverTestError = null;
    this.serverTestSuccess = null;
  }

  async activateOfflineMode(): Promise<void> {
    this.selectedServer = 'offline';
    this.serverAPI = null;
    this.serverWS = null;
    this.serverAuth = null;
    this.activeServer = 'offline';
    this.activeServerAPI = null;
    this.activeServerWS = null;
    this.activeServerAuth = null;
    this.appSettings.setAppSettings({
      serverName: 'offline',
      serverAPI: null,
      serverWS: null,
      serverAuth: null,
    });
    this.appSettings.loadAppSettings();
    this.node.setOffline(null);
    this.notifications.sendInfo(this.translocoService.translate('configure-app.offline-mode-activated'));
    this.serverTestError = null;
    this.serverTestSuccess = null;
    this.showSavedIndicator('server');
  }

  async activateServer(): Promise<void> {
    if (this.selectedServer === 'offline') {
      return this.activateOfflineMode();
    }

    if (this.selectedServer === 'random') {
      this.testingServer = true;
      this.serverTestError = null;
      this.serverTestSuccess = null;
      try {
        this.appSettings.setAppSettings({
          serverName: 'random',
          serverAPI: null,
          serverWS: null,
          serverAuth: null,
        });
        this.appSettings.loadAppSettings();
        this.activeServer = 'random';
        this.activeServerAPI = this.appSettings.settings.serverAPI;
        this.activeServerWS = this.appSettings.settings.serverWS;
        this.activeServerAuth = this.appSettings.settings.serverAuth;
        this.serverAPI = this.activeServerAPI;
        this.serverWS = this.activeServerWS;
        this.serverAuth = this.activeServerAuth;
        this.serverAPIUpdated = this.activeServerAPI;
        this.node.node.status = false;
        await this.walletService.refreshWalletState('server-change');
        this.websocket.forceReconnect();
        this.updateNodeStats();
        this.serverTestSuccess = this.translocoService.translate('configure-app.server-connected-success', { server: 'Random' });
        this.notifications.sendSuccess(this.serverTestSuccess);
        this.showSavedIndicator('server');
      } catch {
        this.serverTestError = this.translocoService.translate('configure-app.server-connection-failed');
      } finally {
        this.testingServer = false;
      }
      return;
    }

    const targetApi = (this.serverAPI || '').trim();
    if (!targetApi || (!targetApi.startsWith('http://') && !targetApi.startsWith('https://'))) {
      this.serverTestError = this.translocoService.translate('configure-app.custom-api-server-has-an-invalid-address');
      return;
    }

    const targetWs = (this.serverWS || '').trim();
    if (targetWs && !targetWs.startsWith('ws://') && !targetWs.startsWith('wss://')) {
      this.serverTestError = this.translocoService.translate('configure-app.custom-update-server-has-an-invalid-address');
      return;
    }

    const targetAuth = (this.serverAuth || '').trim();

    this.testingServer = true;
    this.serverTestError = null;
    this.serverTestSuccess = null;

    try {
      const probe = await this.api.probeServer(targetApi, targetAuth);
      if (probe.success) {
        this.appSettings.setAppSettings({
          serverName: this.selectedServer,
          serverAPI: targetApi,
          serverWS: targetWs || null,
          serverAuth: targetAuth || null,
        });
        this.appSettings.loadAppSettings();

        this.activeServer = this.selectedServer;
        this.activeServerAPI = targetApi;
        this.activeServerWS = targetWs || null;
        this.activeServerAuth = targetAuth || null;
        this.serverAPIUpdated = targetApi;

        this.node.node.status = false;
        await this.walletService.refreshWalletState('server-change');
        this.websocket.forceReconnect();
        this.updateNodeStats();

        const serverName = this.getActiveServerLabel();
        this.serverTestSuccess = this.translocoService.translate('configure-app.server-connected-success', { server: serverName });
        this.notifications.sendSuccess(this.serverTestSuccess);
        this.showSavedIndicator('server');
      } else {
        this.serverTestError = this.translocoService.translate('configure-app.server-connection-failed');
      }
    } catch {
      this.serverTestError = this.translocoService.translate('configure-app.server-connection-failed');
    } finally {
      this.testingServer = false;
    }
  }

  async updateServerSettings() {
    await this.activateServer();
  }

  searchRepresentatives() {
    if (this.defaultRepresentative && !this.util.account.isValidAccount(this.defaultRepresentative)) this.repStatus = 0;
    else this.repStatus = null;

    this.showRepresentatives = true;
    const search = this.defaultRepresentative || '';

    const matches = this.representativeList
      .filter(a => a.name.toLowerCase().indexOf(search.toLowerCase()) !== -1)
      // remove duplicate accounts
      .filter((item, pos, self) => this.util.array.findWithAttr(self, 'id', item.id) === pos)
      .slice(0, 5);

    this.representativeResults$.next(matches);
  }

  selectRepresentative(rep) {
    this.showRepresentatives = false;
    this.defaultRepresentative = rep;
    this.searchRepresentatives();
    this.validateRepresentative();
    this.saveDefaultRepresentative();
  }

  async validateRepresentative() {
    setTimeout(() => this.showRepresentatives = false, 400);
    if (this.defaultRepresentative) this.defaultRepresentative = this.defaultRepresentative.replace(/ /g, '');

    if (!this.defaultRepresentative) {
      this.representativeListMatch = '';
      return;
    }

    const rep = this.repService.getRepresentative(this.defaultRepresentative);
    const ninjaRep = await this.ninja.getAccount(this.defaultRepresentative);

    if (rep) {
      this.representativeListMatch = rep.name;
    } else if (ninjaRep) {
      this.representativeListMatch = ninjaRep.alias;
    } else {
      this.representativeListMatch = '';
    }
  }

  // When changing the Server Config option, prefill values
  serverConfigChange(newServer) {
    this.selectedServer = newServer;
    this.serverTestError = null;
    this.serverTestSuccess = null;

    if (newServer === 'offline') {
      this.serverAPI = null;
      this.serverWS = null;
      this.serverAuth = null;
      this.shouldRandom = null;
      return;
    }

    if (newServer === 'random') {
      this.serverAPI = this.activeServer === 'random' ? this.activeServerAPI : null;
      this.serverWS = null;
      this.serverAuth = null;
      this.shouldRandom = this.translocoService.translate('general.yes');
      return;
    }

    const custom = this.serverOptions.find(c => c.value === newServer);
    if (custom) {
      this.serverAPI = custom.api;
      this.serverAPIUpdated = null;
      this.serverWS = custom.ws;
      this.serverAuth = custom.auth;
      this.shouldRandom = custom.shouldRandom ? this.translocoService.translate('general.yes') : this.translocoService.translate('general.no');
    }

    // reset server stats until updated
    this.nodeBlockCount = null;
    this.nodeUnchecked = null;
    this.nodeCemented = null;
    this.nodeUncemented = null;
    this.peersStakeReq = null;
    this.peersStakeTotal = null;
    this.nodeVendor = null;
    this.nodeNetwork = null;
    this.statsRefreshEnabled = newServer === 'random' ? false : true;
  }

  getRemotePoWOptionName() {
    const optionName = this.translocoService.translate('configure-app.pow-options.external-selected-server');

    if ( (this.selectedServer === 'random') || (this.selectedServer === 'offline') ) {
      return optionName;
    }

    const selectedServerOption = this.appSettings.serverOptions.find(d => d.value === this.selectedServer);

    if (!selectedServerOption) {
      return optionName;
    }

    return ( optionName + ' (' + selectedServerOption.name + ')' );
  }

  async clearWorkCache() {
    const UIkit = window['UIkit'];
    try {
      await UIkit.modal.confirm('<p style="text-align: center;">' + this.translocoService.translate('configure-app.you-are-about-to-delete-all-locally-cached-proof-of-work') + '<br><br><b>' + this.translocoService.translate('configure-app.are-you-sure') + '</b></p>');
      this.workPool.clearCache();
      this.notifications.sendSuccess(this.translocoService.translate('configure-app.successfully-cleared-the-work-cache'));
      return true;
    } catch (err) { return false; }
  }

  async clearWalletData() {
    const UIkit = window['UIkit'];
    try {
      await UIkit.modal.confirm('<p class="uk-alert uk-alert-danger"><br><span class="uk-flex"><span uk-icon="icon: warning; ratio: 3;" class="uk-align-center"></span></span><span style="font-size: 18px;">' + this.translocoService.translate('configure-app.you-are-about-to-delete-all-locally-stored-data-about-your') + '</span><br><br><b style="font-size: 18px;">' + this.translocoService.translate('reset-wallet.before-continuing-make-sure-you-have-saved-the-nano-seed') + '</b><br><br><span style="font-size: 18px;"><b>' + this.translocoService.translate('reset-wallet.you-will-not-be-able-to-recover-the-funds-without-a-backup') + '</b></span></p><br>');
      this.walletService.resetWallet();
      this.walletService.removeWalletData();
      if (FEATURE_NANONYMS && this.nanonymManager) {
        this.nanonymManager.resetAll();
      }

      this.notifications.sendSuccess(this.translocoService.translate('configure-app.successfully-deleted-all-wallet-data'));
    } catch (err) {}
  }

  async clearAllData() {
    const UIkit = window['UIkit'];
    try {
      await UIkit.modal.confirm('<p class="uk-alert uk-alert-danger"><br><span class="uk-flex"><span uk-icon="icon: warning; ratio: 3;" class="uk-align-center"></span></span><span style="font-size: 18px;">' + this.translocoService.translate('configure-app.clear-all-data.1') + '</span><br><br><b style="font-size: 18px;">' + this.translocoService.translate('reset-wallet.before-continuing-make-sure-you-have-saved-the-nano-seed') + '</b><br><br><span style="font-size: 18px;"><b>' + this.translocoService.translate('reset-wallet.you-will-not-be-able-to-recover-the-funds-without-a-backup') + '</b></span></p><br>');
      this.walletService.resetWallet();
      this.walletService.removeWalletData();

      this.workPool.deleteCache();
      this.addressBook.clearAddressBook();
      this.appSettings.clearAppSettings();
      this.repService.resetRepresentativeList();
      this.api.deleteCache();
      if (FEATURE_NANONYMS && this.nanonymManager) {
        this.nanonymManager.resetAll();
      }

      this.loadFromSettings();

      this.notifications.sendSuccess(this.translocoService.translate('configure-app.clear-all-data.successfully-deleted-locally-stored-data-and-reset-the'));

      // Get a new random API server or the app will get stuck in offline mode
      this.updateServerSettings();
    } catch (err) {}
  }

  // open qr reader modal
  openQR(reference, type) {
    const qrResult = this.qrModalService.openQR(reference, type);
    qrResult.then((data) => {
      switch (data.reference) {
        case 'rep1':
          this.defaultRepresentative = data.content;
          this.validateRepresentative();
          break;
      }
    }, () => {}
    );
  }
}
