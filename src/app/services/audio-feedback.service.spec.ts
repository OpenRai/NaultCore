import { TestBed } from '@angular/core/testing';
import { AppSettingsService } from './app-settings.service';
import { AudioFeedbackService } from './audio-feedback.service';

const play = vi.fn();
const setEnabled = vi.fn();
const setVolume = vi.fn();

vi.mock('cuelume', () => ({
  play: (...args: unknown[]) => play(...args),
  setEnabled: (...args: unknown[]) => setEnabled(...args),
  setVolume: (...args: unknown[]) => setVolume(...args),
  setTheme: vi.fn(),
  bind: vi.fn(),
  sounds: [],
  themes: [],
}));

class MockAppSettingsService {
  // Partial on purpose: the real settings object has many fields, and the
  // absent-soundEnabled case is exactly what these tests exercise.
  settings: { soundEnabled?: boolean } = { soundEnabled: true };
}

describe('AudioFeedbackService', () => {
  let service: AudioFeedbackService;

  // The cooldown is real wall-clock time, so tests reset the clock to keep
  // each case independent instead of leaking cooldown state between them.
  beforeEach(() => {
    play.mockClear();
    setEnabled.mockClear();
    vi.useFakeTimers();
    vi.setSystemTime(0);

    TestBed.configureTestingModule({
      providers: [
        AudioFeedbackService,
        { provide: AppSettingsService, useClass: MockAppSettingsService },
      ],
    });

    service = TestBed.inject(AudioFeedbackService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const cueFor = () => play.mock.calls[0]?.[0];
  const emphasisFor = () => play.mock.calls[0]?.[1]?.emphasis;

  describe('allowlist', () => {
    it('plays a strong chord when a send is confirmed', () => {
      service.playForNotification('success', 'success-send', {});
      expect(cueFor()).toBe('success');
      expect(emphasisFor()).toBe('strong');
    });

    it('plays a strong chord when a receive is confirmed', () => {
      service.playForNotification('success', 'success-receive', {});
      expect(cueFor()).toBe('success');
      expect(emphasisFor()).toBe('strong');
    });

    it('plays subtly when something is copied', () => {
      service.playForNotification('success', 'success-copied', {});
      expect(cueFor()).toBe('success');
      expect(emphasisFor()).toBe('subtle');
    });

    it('uses attention while the wallet waits on a Ledger', () => {
      service.playForNotification('info', 'ledger-sign', {});
      expect(cueFor()).toBe('attention');
    });

    it('plays an error when a Ledger signing step cannot continue', () => {
      service.playForNotification('warning', 'wrong-input', {});
      expect(cueFor()).toBe('error');
    });

    it('stays silent for validation warnings', () => {
      service.playForNotification('warning', undefined, {});
      service.playForNotification('error', undefined, {});
      expect(play).not.toHaveBeenCalled();
    });

    it('stays silent for looping progress notifications', () => {
      service.playForNotification('info', 'stealth-opening-progress', {});
      service.playForNotification('info', 'phase2-retry-progress', {});
      service.playForNotification('info', 'pow', {});
      service.playForNotification('info', 'ledger-status', {});
      service.playForNotification('warning', 'rescan-status', {});
      expect(play).not.toHaveBeenCalled();
    });

    it('does not match on the identifier alone, because identifiers lie', () => {
      // `account-added` reads like a success but is really a duplicate warning.
      service.playForNotification('warning', 'account-added', {});
      expect(play).not.toHaveBeenCalled();
    });

    it('honours an explicit cue for outcomes with no identifier', () => {
      service.playForNotification('warning', null, { cue: { name: 'error', emphasis: 'strong' } });
      expect(cueFor()).toBe('error');
      expect(emphasisFor()).toBe('strong');
    });
  });

  describe('background arrivals', () => {
    it('stays silent while the tab is visible', () => {
      vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
      service.playForNotification('success', 'success-receive-nanonym', {});
      expect(play).not.toHaveBeenCalled();
    });

    it('speaks up when the tab is hidden', () => {
      vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
      service.playForNotification('success', 'success-receive-nanonym', {});
      expect(cueFor()).toBe('success');
      vi.restoreAllMocks();
    });

    it('still sounds visible-tab events while hidden', () => {
      vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
      service.playForNotification('success', 'success-copied', {});
      expect(play).toHaveBeenCalledTimes(1);
      vi.restoreAllMocks();
    });
  });

  describe('mute', () => {
    it('plays nothing once disabled', () => {
      service.setEnabled(false);
      service.playForNotification('success', 'success-send', {});
      expect(play).not.toHaveBeenCalled();
    });

    it('resumes when re-enabled', () => {
      service.setEnabled(false);
      service.setEnabled(true);
      vi.setSystemTime(10_000);
      service.playForNotification('success', 'success-send', {});
      expect(play).toHaveBeenCalledTimes(1);
    });

    it('defaults to on when the setting is absent', () => {
      (TestBed.inject(AppSettingsService) as unknown as MockAppSettingsService).settings = {};
      service.syncPreference();
      expect(service.isEnabled()).toBe(true);
    });

    it('reads a persisted false correctly', () => {
      (TestBed.inject(AppSettingsService) as unknown as MockAppSettingsService).settings = { soundEnabled: false };
      service.syncPreference();
      expect(service.isEnabled()).toBe(false);
      expect(setEnabled).toHaveBeenCalledWith(false);
    });
  });

  describe('cooldown', () => {
    it('collapses a burst of identical events', () => {
      service.playForNotification('success', 'success-send', {});
      vi.setSystemTime(50);
      service.playForNotification('success', 'success-send', {});
      vi.setSystemTime(100);
      service.playForNotification('success', 'success-send', {});
      expect(play).toHaveBeenCalledTimes(1);
    });

    it('allows distinct events once the cooldown has passed', () => {
      service.playForNotification('success', 'success-send', {});
      vi.setSystemTime(1500);
      service.playForNotification('success', 'success-receive', {});
      expect(play).toHaveBeenCalledTimes(2);
    });
  });

  it('never lets audio break the caller', () => {
    play.mockImplementationOnce(() => { throw new Error('no Web Audio'); });
    expect(() => service.playForNotification('success', 'success-send', {})).not.toThrow();
  });
});