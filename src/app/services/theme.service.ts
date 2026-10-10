import { Injectable, OnDestroy, inject } from '@angular/core';
import { AppSettingsService, AppearanceMode, ResolvedTheme } from './app-settings.service';

/** Matches the colour the browser reports as "no preference", and as a fallback. */
const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';

// Safari and Chrome paint the PWA chrome bar from this meta tag, so it has to
// track the theme the app actually rendered rather than the OS preference.
const THEME_COLORS: Record<ResolvedTheme, string> = {
  light: '#f8f8f8',
  dark: '#22222A',
};

/**
 * The single owner of the app's appearance.
 *
 * Every surface asks this service what the theme is instead of deciding for
 * itself. That used to be split between AppComponent.updateAppTheme() and
 * ConfigureAppComponent.onNightModeChange(), which each applied body classes,
 * synced the theme-color meta, and persisted a boolean - and the sidebar was
 * consequently never given light values at all.
 *
 * The class contract is unchanged and deliberately binary: `light-mode` and
 * `dark-mode` are mutually exclusive on <body>, which is what every stylesheet
 * already selects on. `auto` is a *preference*, not a third visual state, so it
 * resolves to one of the two before anything is applied.
 */
@Injectable()
export class ThemeService implements OnDestroy {
  private settings = inject(AppSettingsService);

  private mediaQuery: MediaQueryList | null = null;
  private readonly onSystemSchemeChange = () => this.apply();
  private readonly onStorageChange = (event: StorageEvent) => {
    // A second tab can change the preference; localStorage has no in-process
    // notification, so listen for the one the browser does send.
    if (event.key === this.settings.storeKey) {
      this.settings.loadAppSettings();
      this.apply();
    }
  };

  /** The user's preference, including 'auto'. */
  get mode(): AppearanceMode {
    return this.settings.settings.appearanceMode;
  }

  /** The theme actually in effect. */
  get resolved(): ResolvedTheme {
    if (this.mode === 'auto') {
      return this.prefersDark() ? 'dark' : 'light';
    }
    return this.mode;
  }

  /** True when the theme is being decided by the OS rather than by the user. */
  get followingSystem(): boolean {
    return this.mode === 'auto';
  }

  /**
   * Applies the current preference and keeps following the OS while it is
   * 'auto'. Call once settings are loaded, before the first paint matters.
   */
  start() {
    this.watchSystemScheme();
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('storage', this.onStorageChange);
    }
    this.apply();
  }

  /**
   * Sets an explicit preference. 'auto' hands the decision back to the OS, so
   * the system listener has to be live before this can be selected.
   */
  setMode(mode: AppearanceMode) {
    this.settings.setAppSetting('appearanceMode', mode);
    this.apply();
  }

  ngOnDestroy() {
    this.unwatchSystemScheme();
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('storage', this.onStorageChange);
    }
  }

  private prefersDark(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      // No matchMedia means no preference to follow; the light theme is the
      // base stylesheet and the safer default for an unreadable surface.
      return false;
    }
    return window.matchMedia(DARK_SCHEME_QUERY).matches;
  }

  private watchSystemScheme() {
    if (this.mediaQuery !== null || typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    this.mediaQuery = window.matchMedia(DARK_SCHEME_QUERY);
    // addEventListener on a MediaQueryList is well supported; addListener only
    // exists for older engines and is deprecated.
    if (typeof this.mediaQuery.addEventListener === 'function') {
      this.mediaQuery.addEventListener('change', this.onSystemSchemeChange);
    }
  }

  private unwatchSystemScheme() {
    if (this.mediaQuery === null) {
      return;
    }
    if (typeof this.mediaQuery.removeEventListener === 'function') {
      this.mediaQuery.removeEventListener('change', this.onSystemSchemeChange);
    }
    this.mediaQuery = null;
  }

  private apply() {
    if (typeof document === 'undefined') {
      return;
    }
    const theme = this.resolved;
    const body = document.body;
    body.classList.toggle('light-mode', theme === 'light');
    body.classList.toggle('dark-mode', theme === 'dark');

    // The root element, not the body, is what the browser consults for the
    // viewport: scrollbars, form controls, and the default canvas all follow
    // this. Setting it on the body leaves the window itself unthemed.
    const root = document.documentElement;
    root.style.colorScheme = theme;
    root.setAttribute('data-theme', theme);

    document.querySelectorAll('meta[name="theme-color"]').forEach(el => {
      el.setAttribute('content', THEME_COLORS[theme]);
    });
  }
}