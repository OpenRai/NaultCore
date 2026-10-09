import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { of } from 'rxjs';
import { ConfigureAppComponent } from './configure-app.component';
import { WalletService } from '../../services/wallet.service';
import { NotificationService } from '../../services/notification.service';
import { AudioFeedbackService } from '../../services/audio-feedback.service';
import { AppSettingsService } from '../../services/app-settings.service';
import { AddressBookService } from '../../services/address-book.service';
import { PowRoutingService } from '../../services/pow-routing.service';
import { ApiService } from '../../services/api.service';
import { WebsocketService } from '../../services/websocket.service';
import { WorkPoolService } from '../../services/work-pool.service';
import { RepresentativeService } from '../../services/representative.service';
import { NodeService } from '../../services/node.service';
import { UtilService } from '../../services/util.service';
import { PriceService } from '../../services/price.service';
import { NinjaService } from '../../services/ninja.service';
import { QrModalService } from '../../services/qr-modal.service';
import { TranslocoService } from '@jsverse/transloco';
import { NanoNymManagerService } from '../../services/nanonym-manager.service';

describe('ConfigureAppComponent', () => {
  let component: ConfigureAppComponent;
  let fixture: ComponentFixture<ConfigureAppComponent>;
  let mockWalletService: any;
  let mockNotifications: any;
  let mockAudioFeedback: any;
  let mockAppSettings: any;
  let mockPowRouting: any;
  let mockApi: any;
  let mockWebsocket: any;
  let mockWorkPool: any;
  let mockRepService: any;
  let mockNode: any;
  let mockUtil: any;
  let mockPrice: any;
  let mockNinja: any;
  let mockQrModal: any;
  let mockTransloco: any;
  let mockNanonymManager: any;

  beforeEach(async () => {
    mockWalletService = {
      reloadFiatBalances: vi.fn(),
      saveWalletExport: vi.fn(),
      refreshWalletState: vi.fn(),
      isConfigured: vi.fn(() => false),
      resetWallet: vi.fn(),
      removeWalletData: vi.fn(),
    };

    mockNotifications = {
      sendSuccess: vi.fn(),
      sendWarning: vi.fn(),
      sendInfo: vi.fn(),
    };

    mockAudioFeedback = {
      setEnabled: vi.fn(),
      isEnabled: vi.fn(() => true),
      syncPreference: vi.fn(),
    };

    mockAppSettings = {
      settings: {
        language: 'en',
        displayCurrency: 'USD',
        lightModeEnabled: false,
        identiconsStyle: 'none',
        useNostr: true,
        useOrbitDb: false,
        walletStore: 'localStorage',
        lockInactivityMinutes: 30,
        powSource: 'auto',
        multiplierSource: 1,
        customWorkServer: '',
        customWorkServerAuth: '',
        pendingOption: 'amount',
        decentralizedAliasesOption: 'disabled',
        serverName: 'random',
        serverAPI: 'https://rpc.example/api',
        serverWS: 'wss://rpc.example/ws',
        serverAuth: '',
        minimumReceive: null,
        defaultRepresentative: null,
      },
      serverOptions: [
        { name: 'Random', value: 'random' },
        { name: 'Custom', value: 'custom', api: '', ws: '', auth: '' },
        { name: 'Node 1', value: 'node1', api: 'https://node1.example/api', ws: 'wss://node1.example/ws', auth: 'token' },
        { name: 'Offline', value: 'offline' },
      ],
      setAppSetting: vi.fn((key, val) => {
        mockAppSettings.settings[key] = val;
      }),
      setAppSettings: vi.fn((obj) => {
        Object.assign(mockAppSettings.settings, obj);
      }),
      loadAppSettings: vi.fn(),
      loadServerSettings: vi.fn(),
      clearAppSettings: vi.fn(),
    };

    mockPowRouting = {
      state$: of({ status: 'ready', policy: 'auto', route: 'local' }),
      policyFromSource: vi.fn((s) => s || 'auto'),
      syncFromSettings: vi.fn(),
      resolveRoute: vi.fn(() => Promise.resolve('local')),
      applyPolicy: vi.fn(),
      reprobe: vi.fn(),
    };

    mockApi = {
      probeServer: vi.fn(),
      probeWorkServer: vi.fn(),
      blockCount: vi.fn(() => Promise.resolve({ count: 100, unchecked: 0, cemented: 100 })),
      confirmationQuorum: vi.fn(() => Promise.resolve(null)),
      version: vi.fn(() => Promise.resolve({ node_vendor: 'Nano V26', network: 'live' })),
      deleteCache: vi.fn(),
    };

    mockWebsocket = {
      forceReconnect: vi.fn(),
    };

    mockWorkPool = {
      clearCache: vi.fn(),
      deleteCache: vi.fn(),
    };

    mockRepService = {
      getSortedRepresentatives: vi.fn(() => []),
      getRepresentative: vi.fn(() => null),
      resetRepresentativeList: vi.fn(),
    };

    mockNode = {
      node: { status: true },
      setOffline: vi.fn(),
      setOnline: vi.fn(),
      setLoading: vi.fn(),
    };

    mockUtil = {
      account: {
        isValidNanoAmount: vi.fn((val) => val != null && val !== '' && !isNaN(Number(val))),
        isValidAccount: vi.fn((val) => typeof val === 'string' && val.startsWith('nano_')),
      },
      nano: {
        rawToMnano: vi.fn((raw) => raw),
      },
      array: {
        findWithAttr: vi.fn(() => 0),
      },
    };

    mockPrice = {
      getPrice: vi.fn(() => Promise.resolve(1)),
    };

    mockNinja = {
      recommendedRandomized: vi.fn(() => Promise.resolve([])),
      getAccount: vi.fn(() => Promise.resolve(null)),
    };

    mockQrModal = {
      openQR: vi.fn(),
    };

    mockTransloco = {
      getAvailableLangs: vi.fn(() => [
        { id: 'en', label: 'English' },
        { id: 'de', label: 'Deutsch' },
      ]),
      translate: vi.fn((k, params?) => {
        if (params?.server) return `Connected to ${params.server}`;
        return k;
      }),
      setActiveLang: vi.fn(),
    };

    mockNanonymManager = {
      resetAll: vi.fn(),
    };

    await TestBed.configureTestingModule({
      declarations: [ConfigureAppComponent],
      imports: [FormsModule],
      providers: [
        { provide: WalletService, useValue: mockWalletService },
        { provide: NotificationService, useValue: mockNotifications },
        { provide: AudioFeedbackService, useValue: mockAudioFeedback },
        { provide: AppSettingsService, useValue: mockAppSettings },
        { provide: AddressBookService, useValue: { clearAddressBook: vi.fn() } },
        { provide: PowRoutingService, useValue: mockPowRouting },
        { provide: ApiService, useValue: mockApi },
        { provide: WebsocketService, useValue: mockWebsocket },
        { provide: WorkPoolService, useValue: mockWorkPool },
        { provide: RepresentativeService, useValue: mockRepService },
        { provide: NodeService, useValue: mockNode },
        { provide: UtilService, useValue: mockUtil },
        { provide: PriceService, useValue: mockPrice },
        { provide: NinjaService, useValue: mockNinja },
        { provide: QrModalService, useValue: mockQrModal },
        { provide: TranslocoService, useValue: mockTransloco },
        { provide: NanoNymManagerService, useValue: mockNanonymManager },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ConfigureAppComponent);
    component = fixture.componentInstance;
    component.ngOnInit();
  });

  describe('Ordinary Preference Autosave', () => {
    it('autosaves language changes immediately with indicator', () => {
      component.onLanguageChange('de');

      expect(component.selectedLanguage).toBe('de');
      expect(mockAppSettings.setAppSetting).toHaveBeenCalledWith('language', 'de');
      expect(mockTransloco.setActiveLang).toHaveBeenCalledWith('de');
      expect(component.savedSection).toBe('display');
    });

    it('autosaves fiat currency changes and reloads balances', async () => {
      await component.onCurrencyChange('EUR');

      expect(component.selectedCurrency).toBe('EUR');
      expect(mockAppSettings.setAppSetting).toHaveBeenCalledWith('displayCurrency', 'EUR');
      expect(mockPrice.getPrice).toHaveBeenCalledWith('EUR');
      expect(mockWalletService.reloadFiatBalances).toHaveBeenCalled();
      expect(component.savedSection).toBe('display');
    });

    it('autosaves night mode appearance changes', () => {
      component.onNightModeChange('enabled');

      expect(component.selectedNightModeOption).toBe('enabled');
      expect(mockAppSettings.setAppSetting).toHaveBeenCalledWith('lightModeEnabled', false);
      expect(component.savedSection).toBe('display');
    });

    it('autosaves identicon style changes', () => {
      component.onIdenticonChange('natricon');

      expect(component.selectedIdenticonOption).toBe('natricon');
      expect(mockAppSettings.setAppSetting).toHaveBeenCalledWith('identiconsStyle', 'natricon');
      expect(component.savedSection).toBe('display');
    });

    it('autosaves inactivity lock timeout', () => {
      component.onInactivityChange(15);

      expect(component.selectedInactivityMinutes).toBe(15);
      expect(mockAppSettings.setAppSetting).toHaveBeenCalledWith('lockInactivityMinutes', 15);
      expect(component.savedSection).toBe('wallet');
    });

    it('autosaves receive method and triggers pending refresh', () => {
      component.onPendingOptionChange('date');

      expect(component.selectedPendingOption).toBe('date');
      expect(mockAppSettings.setAppSetting).toHaveBeenCalledWith('pendingOption', 'date');
      expect(mockWalletService.refreshWalletState).toHaveBeenCalledWith('settings-change');
      expect(component.savedSection).toBe('wallet');
    });

    it('autosaves decentralized aliases toggle', () => {
      component.onDecentralizedAliasesChange('enabled');

      expect(component.selectedDecentralizedAliasesOption).toBe('enabled');
      expect(mockAppSettings.setAppSetting).toHaveBeenCalledWith('decentralizedAliasesOption', 'enabled');
      expect(component.savedSection).toBe('wallet');
    });

    it('autosaves valid minimum receive amount on blur', () => {
      component.minimumReceive = '0.001';
      component.onMinimumReceiveBlur();

      expect(mockAppSettings.setAppSetting).toHaveBeenCalledWith('minimumReceive', '0.001');
      expect(mockWalletService.refreshWalletState).toHaveBeenCalledWith('settings-change');
      expect(component.savedSection).toBe('wallet');
    });

    it('rejects invalid minimum receive amount and does not persist', () => {
      component.minimumReceive = 'invalid-amount';
      component.onMinimumReceiveBlur();

      expect(mockAppSettings.setAppSetting).not.toHaveBeenCalledWith('minimumReceive', 'invalid-amount');
      expect(mockNotifications.sendWarning).toHaveBeenCalled();
    });

    it('autosaves valid default representative', () => {
      component.defaultRepresentative = 'nano_1validaccount123';
      component.saveDefaultRepresentative();

      expect(mockAppSettings.setAppSetting).toHaveBeenCalledWith('defaultRepresentative', 'nano_1validaccount123');
      expect(component.savedSection).toBe('wallet');
    });
  });

  describe('Custom Work Server Test & Use', () => {
    it('promotes candidate to active when probe succeeds', async () => {
      mockApi.probeWorkServer.mockResolvedValue({ success: true });
      component.candidateWorkServer = 'https://work.example/api';
      component.candidateWorkServerAuth = 'Bearer work-key';

      await component.activateWorkServer();

      expect(component.activeWorkServer).toBe('https://work.example/api');
      expect(component.activeWorkServerAuth).toBe('Bearer work-key');
      expect(mockAppSettings.setAppSetting).toHaveBeenCalledWith('customWorkServer', 'https://work.example/api');
      expect(mockAppSettings.setAppSetting).toHaveBeenCalledWith('customWorkServerAuth', 'Bearer work-key');
      expect(mockNotifications.sendSuccess).toHaveBeenCalled();
      expect(component.workServerTestError).toBeNull();
    });

    it('retains current working work server untouched when probe fails', async () => {
      component.activeWorkServer = 'https://old-work.example/api';
      component.activeWorkServerAuth = 'Bearer old-key';
      mockAppSettings.settings.customWorkServer = 'https://old-work.example/api';

      mockApi.probeWorkServer.mockResolvedValue({ success: false, error: 'Connection refused' });
      component.candidateWorkServer = 'https://broken-work.example/api';
      component.candidateWorkServerAuth = 'Bearer bad-key';

      await component.activateWorkServer();

      expect(component.activeWorkServer).toBe('https://old-work.example/api');
      expect(mockAppSettings.settings.customWorkServer).toBe('https://old-work.example/api');
      expect(component.workServerTestError).toBe('configure-app.work-server-connection-failed');
    });

    it('resets custom work server to default', () => {
      component.activeWorkServer = 'https://work.example/api';
      component.resetWorkServerToDefault();

      expect(component.activeWorkServer).toBe('');
      expect(component.candidateWorkServer).toBe('');
      expect(mockAppSettings.setAppSetting).toHaveBeenCalledWith('customWorkServer', '');
    });
  });

  describe('Nano RPC Server Test & Use', () => {
    it('promotes candidate server to active when probe succeeds', async () => {
      mockApi.probeServer.mockResolvedValue({ success: true, version: { node_vendor: 'Nano V26' } });
      component.selectedServer = 'node1';
      component.serverAPI = 'https://node1.example/api';
      component.serverWS = 'wss://node1.example/ws';
      component.serverAuth = 'Bearer token';

      await component.activateServer();

      expect(component.activeServer).toBe('node1');
      expect(component.activeServerAPI).toBe('https://node1.example/api');
      expect(mockAppSettings.setAppSettings).toHaveBeenCalledWith({
        serverName: 'node1',
        serverAPI: 'https://node1.example/api',
        serverWS: 'wss://node1.example/ws',
        serverAuth: 'Bearer token',
      });
      expect(mockWalletService.refreshWalletState).toHaveBeenCalledWith('server-change');
      expect(mockWebsocket.forceReconnect).toHaveBeenCalled();
      expect(component.serverTestError).toBeNull();
    });

    it('leaves existing active server configuration untouched when probe fails', async () => {
      component.activeServer = 'random';
      component.activeServerAPI = 'https://rpc.example/api';
      mockAppSettings.settings.serverName = 'random';
      mockAppSettings.settings.serverAPI = 'https://rpc.example/api';

      mockApi.probeServer.mockResolvedValue({ success: false, error: 'Connection timed out' });
      component.selectedServer = 'custom';
      component.serverAPI = 'https://unreachable.example/api';

      await component.activateServer();

      expect(component.activeServer).toBe('random');
      expect(component.activeServerAPI).toBe('https://rpc.example/api');
      expect(mockAppSettings.settings.serverName).toBe('random');
      expect(component.serverTestError).toBe('configure-app.server-connection-failed');
    });

    it('activates offline mode directly', async () => {
      component.selectedServer = 'offline';
      await component.activateOfflineMode();

      expect(component.activeServer).toBe('offline');
      expect(mockNode.setOffline).toHaveBeenCalled();
      expect(mockNotifications.sendInfo).toHaveBeenCalled();
    });

    it('reverts candidate values back to active server configuration', () => {
      component.activeServer = 'random';
      component.activeServerAPI = 'https://rpc.example/api';
      component.selectedServer = 'custom';
      component.serverAPI = 'https://changed.example/api';

      component.revertServerCandidate();

      expect(component.selectedServer).toBe('random');
      expect(component.serverAPI).toBe('https://rpc.example/api');
      expect(component.serverTestError).toBeNull();
    });
  });
});
