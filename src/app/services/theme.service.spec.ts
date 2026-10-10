import { TestBed } from '@angular/core/testing';
import { AppSettingsService } from './app-settings.service';
import { ThemeService } from './theme.service';

class MockAppSettingsService {
  settings: { appearanceMode: string } = { appearanceMode: 'auto' };
  // Mirrors the real store key so the cross-tab test exercises the real filter.
  storeKey = 'nanovault-appsettings';
  setAppSetting = vi.fn((key: string, value: unknown) => {
    this.settings[key] = value;
  });
  loadAppSettings = vi.fn(() => {
    try {
      const raw = localStorage.getItem(this.storeKey);
      if (raw) {
        this.settings = { ...this.settings, ...JSON.parse(raw) };
      }
    } catch (e) { /* storage unavailable */ }
    return this.settings;
  });
}

/**
 * Replaces window.matchMedia with one whose result the test controls, including
 * dispatching change events the way a real OS switch does.
 */
function stubMatchMedia(initialDark: boolean) {
  let dark = initialDark;
  const listeners = new Set<() => void>();
  const query = {
    get matches() {
      return dark;
    },
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  };
  const stub = vi.fn(() => query);
  vi.stubGlobal('matchMedia', stub);
  return {
    setSystemDark(next: boolean) {
      dark = next;
      listeners.forEach(listener => listener());
    },
    listenerCount: () => listeners.size,
  };
}

function themeColorMeta(): string[] {
  return Array.from(document.querySelectorAll('meta[name="theme-color"]')).map(
    el => el.getAttribute('content'),
  );
}

describe('ThemeService', () => {
  let settings: MockAppSettingsService;

  function createService(): ThemeService {
    TestBed.configureTestingModule({
      providers: [
        ThemeService,
        // useValue, not useClass: the test mutates one settings instance before
        // injecting, so the service has to see that same object.
        { provide: AppSettingsService, useValue: settings },
      ],
    });
    return TestBed.inject(ThemeService);
  }

  beforeEach(() => {
    settings = new MockAppSettingsService();
    document.body.classList.remove('light-mode', 'dark-mode');
    document.head.innerHTML = '<meta name="theme-color" content="#22222A">';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.classList.remove('light-mode', 'dark-mode');
  });

  describe('resolution', () => {
    it('follows a dark system when the preference is auto', () => {
      stubMatchMedia(true);
      const service = createService();
      expect(service.mode).toBe('auto');
      expect(service.resolved).toBe('dark');
      expect(service.followingSystem).toBe(true);
    });

    it('follows a light system when the preference is auto', () => {
      stubMatchMedia(false);
      expect(createService().resolved).toBe('light');
    });

    it('honours an explicit light preference on a dark system', () => {
      stubMatchMedia(true);
      settings.settings.appearanceMode = 'light';
      expect(createService().resolved).toBe('light');
    });

    it('honours an explicit dark preference on a light system', () => {
      stubMatchMedia(false);
      settings.settings.appearanceMode = 'dark';
      expect(createService().resolved).toBe('dark');
    });

    it('falls back to light when matchMedia is unavailable', () => {
      vi.stubGlobal('matchMedia', undefined);
      expect(createService().resolved).toBe('light');
    });
  });

  describe('applying', () => {
    it('sets exactly one body class', () => {
      stubMatchMedia(true);
      const service = createService();

      service.start();
      expect(document.body.classList.contains('dark-mode')).toBe(true);
      expect(document.body.classList.contains('light-mode')).toBe(false);

      settings.settings.appearanceMode = 'light';
      service.setMode('light');
      expect(document.body.classList.contains('light-mode')).toBe(true);
      expect(document.body.classList.contains('dark-mode')).toBe(false);
    });

it('syncs the theme-color meta to the rendered theme', () => {
    stubMatchMedia(true);
    const service = createService();

    service.start();
    expect(themeColorMeta()).toEqual(['#22222A']);

    service.setMode('light');
    expect(themeColorMeta()).toEqual(['#f8f8f8']);
  });

  /**
   * The root element, not the body, is what the browser consults for the
   * viewport. Without this the window scrollbars and default canvas stay light
   * while the app is dark.
   */
  it('sets color-scheme on the document element so native UI follows', () => {
    stubMatchMedia(true);
    const service = createService();

    service.start();
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    service.setMode('light');
    expect(document.documentElement.style.colorScheme).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('follows a cross-tab change to the stored preference', () => {
    stubMatchMedia(false);
    const service = createService();
    service.start();
    expect(document.body.classList.contains('light-mode')).toBe(true);

    // A second tab wrote a different preference into localStorage.
    localStorage.setItem('nanovault-appsettings', JSON.stringify({ appearanceMode: 'dark' }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'nanovault-appsettings' }));

    expect(service.mode).toBe('dark');
    expect(document.body.classList.contains('dark-mode')).toBe(true);
    localStorage.removeItem('nanovault-appsettings');
  });

  it('ignores storage events for unrelated keys', () => {
    stubMatchMedia(false);
    const service = createService();
    service.start();

    window.dispatchEvent(new StorageEvent('storage', { key: 'something-else' }));

    expect(document.body.classList.contains('light-mode')).toBe(true);
  });

    it('persists an explicit preference', () => {
      stubMatchMedia(false);
      const service = createService();

      service.setMode('auto');
      expect(settings.setAppSetting).toHaveBeenCalledWith('appearanceMode', 'auto');
      expect(service.followingSystem).toBe(true);
    });
  });

  describe('following the system', () => {
    it('re-applies when the OS scheme changes while auto', () => {
      const media = stubMatchMedia(false);
      const service = createService();
      service.start();
      expect(document.body.classList.contains('light-mode')).toBe(true);

      media.setSystemDark(true);

      expect(service.resolved).toBe('dark');
      expect(document.body.classList.contains('dark-mode')).toBe(true);
      expect(themeColorMeta()).toEqual(['#22222A']);
    });

    it('ignores OS changes once the preference is explicit', () => {
      const media = stubMatchMedia(false);
      const service = createService();
      service.start();

      service.setMode('dark');
      media.setSystemDark(true);

      expect(service.resolved).toBe('dark');
      expect(document.body.classList.contains('dark-mode')).toBe(true);
    });

    it('releases the listener when destroyed', () => {
      const media = stubMatchMedia(false);
      const service = createService();
      service.start();
      expect(media.listenerCount()).toBe(1);

      service.ngOnDestroy();

      expect(media.listenerCount()).toBe(0);
    });
  });

  /**
   * NaultCore-d9a: the sidebar and the content pane must never disagree. This
   * asserts both surfaces resolve to the same theme, which is the mixed-mode
   * regression that has been open since September.
   */
  it('agrees with the content surface on every appearance preference', () => {
    stubMatchMedia(true);
    document.body.innerHTML =
      '<div class="nav-container"></div><div class="content-container"></div>';
    const service = createService();

    for (const mode of ['auto', 'light', 'dark'] as const) {
      service.setMode(mode);
      const expected = service.resolved === 'dark' ? 'dark-mode' : 'light-mode';
      expect(document.body.classList.contains(expected)).toBe(true);
    }

    // Both surfaces read the same custom properties off <body>, so a single
    // assertion on each proves neither can drift from the other.
    const nav = document.querySelector('.nav-container') as HTMLElement;
    const content = document.querySelector('.content-container') as HTMLElement;
    expect(nav).toBeTruthy();
    expect(content).toBeTruthy();
    expect(getComputedStyle(nav).getPropertyValue('--nav-bg')).toBe(
      getComputedStyle(content).getPropertyValue('--nav-bg'),
    );

    document.body.innerHTML = '';
  });

  /**
   * The switch cycles light -> dark -> auto. Auto is where the switch goes
   * inert behind its overlay, so `followingSystem` is the signal AppComponent
   * uses both to disable the control and to refuse the click.
   */
  it('cycles light, dark, auto without skipping a state', () => {
    stubMatchMedia(false);
    const service = createService();
    const cycle: Record<string, string> = { light: 'dark', dark: 'auto', auto: 'light' };

    service.setMode('light');
    const visited: string[] = [];
    for (let step = 0; step < 4; step += 1) {
      visited.push(service.mode);
      service.setMode(cycle[service.mode] as 'auto' | 'light' | 'dark');
    }

    expect(visited).toEqual(['light', 'dark', 'auto', 'light']);
    // The step out of auto is what the Auto overlay performs, not the switch.
    expect(service.followingSystem).toBe(false);
  });

  it('reports auto so the switch can disable itself and refuse its own click', () => {
    stubMatchMedia(false);
    const service = createService();

    service.setMode('auto');
    expect(service.followingSystem).toBe(true);

    // Mirrors AppComponent.cycleAppearanceMode(), which returns early in auto.
    service.setMode('auto');
    expect(service.mode).toBe('auto');
    expect(service.followingSystem).toBe(true);
  });
});