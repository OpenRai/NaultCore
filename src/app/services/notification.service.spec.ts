import { ManageWalletComponent } from '../components/manage-wallet/manage-wallet.component';
import { BehaviorSubject } from 'rxjs';
import { WalletUnlockLinkComponent } from '../components/wallet-unlock-link/wallet-unlock-link.component';
import { WalletService } from './wallet.service';
import { NotificationsComponent } from '../components/notifications/notifications.component';
import { TestBed } from '@angular/core/testing';

import { AppSettingsService } from './app-settings.service';
import { AudioFeedbackService } from './audio-feedback.service';
import { NotificationService } from './notification.service';

class MockAudioFeedbackService {
  playForNotification = vi.fn();
}

describe('NotificationService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    TestBed.configureTestingModule({
      providers: [
        NotificationService,
        { provide: AudioFeedbackService, useClass: MockAudioFeedbackService },
        { provide: AppSettingsService, useValue: { settings: { soundEnabled: true } } },
      ]
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('mirrors each toast to its matching console severity', () => {
    const service = TestBed.inject(NotificationService);
    const debug = vi.spyOn(console, 'debug');
    const info = vi.spyOn(console, 'info');
    const warning = vi.spyOn(console, 'warn');
    const error = vi.spyOn(console, 'error');

    service.sendInfo('Informational event');
    service.sendSuccess('Successful event');
    service.sendWarning('Warning event');
    service.sendError('Error event');

    expect(info).toHaveBeenCalledWith('[Notification]', 'ℹ️', 'Informational event');
    expect(info).toHaveBeenCalledWith('[Notification]', '✅', 'Successful event');
    expect(warning).toHaveBeenCalledWith('[Notification]', '⚠️', 'Warning event');
    expect(error).toHaveBeenCalledWith('[Notification]', '💥', 'Error event');
    expect(debug).not.toHaveBeenCalled();
  });

  describe('duplicate suppression', () => {
    it('drops a repeat raised under a live identifier', () => {
      const service = TestBed.inject(NotificationService);
      const audio = TestBed.inject(AudioFeedbackService);
      const emitted = [];
      // Subscribe before sending: notifications$ is a BehaviorSubject, so a late
      // subscriber would be replayed the previous toast.
      service.notifications$.subscribe(n => n && emitted.push(n));

      service.sendInfo('Opening 1 of 3', { identifier: 'progress' });
      service.sendInfo('Opening 2 of 3', { identifier: 'progress' });
      service.sendInfo('Opening 3 of 3', { identifier: 'progress' });

      // One toast on screen, and a suppressed repeat never reaches the audio hook.
      expect(emitted).toHaveLength(1);
      expect(audio.playForNotification).toHaveBeenCalledTimes(1);
    });

    it('emits normally for identifiers that are not yet live', () => {
      const service = TestBed.inject(NotificationService);
      const emitted = [];
      service.notifications$.subscribe(n => n && emitted.push(n));

      service.sendSuccess('Sent', { identifier: 'success-send' });
      expect(emitted).toHaveLength(1);
    });

    it('never suppresses an un-identified notification', () => {
      const service = TestBed.inject(NotificationService);
      const emitted = [];
      service.notifications$.subscribe(n => n && emitted.push(n));

      service.sendInfo('Reconnecting');
      service.sendInfo('Reconnecting');
      expect(emitted).toHaveLength(2);
    });
  });

  describe('identifier reuse', () => {
    // Regression guard. Send and receive both remove the toast and immediately
    // re-raise it under the same identifier on every single transaction. If
    // suppression remembered identifiers forever rather than tracking the live
    // set, the second send and every one after it would go unannounced.
    it('sounds again for a second send under the reused success-send identifier', () => {
      const service = TestBed.inject(NotificationService);
      const audio = TestBed.inject(AudioFeedbackService);

      service.removeNotification('success-send');
      service.sendSuccess('Successfully sent 1 XNO!', { identifier: 'success-send' });
      service.removeNotification('success-send');
      service.sendSuccess('Successfully sent 2 XNO!', { identifier: 'success-send' });

      expect(audio.playForNotification).toHaveBeenCalledTimes(2);
      expect(audio.playForNotification).toHaveBeenLastCalledWith(
        'success',
        'success-send',
        expect.anything(),
      );
    });

    it('sounds again for consecutive receives', () => {
      const service = TestBed.inject(NotificationService);
      const audio = TestBed.inject(AudioFeedbackService);

      service.removeNotification('success-receive');
      service.sendSuccess('Successfully received 1 XNO!', { identifier: 'success-receive' });
      service.removeNotification('success-receive');
      service.sendSuccess('Successfully received 2 XNO!', { identifier: 'success-receive' });

      expect(audio.playForNotification).toHaveBeenCalledTimes(2);
    });
  });

  describe('toast lifetime', () => {
    it('frees an identifier once the toast expires', () => {
      const service = TestBed.inject(NotificationService);
      const emitted = [];
      service.notifications$.subscribe(n => n && emitted.push(n));

      service.sendInfo('First', { identifier: 'rescan', length: 5000 });
      vi.advanceTimersByTime(6000);
      service.sendInfo('Second', { identifier: 'rescan', length: 5000 });

      expect(emitted).toHaveLength(2);
    });

    it('keeps a zero-length identifier live until it is removed', () => {
      const service = TestBed.inject(NotificationService);
      const emitted = [];
      service.notifications$.subscribe(n => n && emitted.push(n));

      service.sendInfo('Working', { identifier: 'pow', length: 0 });
      vi.setSystemTime(60_000);
      service.sendInfo('Still working', { identifier: 'pow', length: 0 });
      expect(emitted).toHaveLength(1);

      service.removeNotification('pow');
      service.sendInfo('Done', { identifier: 'pow', length: 0 });
      expect(emitted).toHaveLength(2);
    });

    it('defaults the length so the component and the expiry timer agree', () => {
      const service = TestBed.inject(NotificationService);
      const emitted = [];
      service.notifications$.subscribe(n => n && emitted.push(n));

      service.sendInfo('No length given');
      expect(emitted[0].options.length).toBe(5000);
    });
  });
});

describe('wallet unlock links', () => {
  it('requests unlock immediately, prevents toast dismissal and suppresses repeated requests until cancellation', async () => {
    let cancel: (result: boolean) => void;
    const wallet = {
      isLocked: () => true,
      requestWalletUnlock: vi.fn(() => new Promise<boolean>(resolve => { cancel = resolve; })),
    };
    TestBed.configureTestingModule({ providers: [{ provide: WalletService, useValue: wallet }] });
    const link = TestBed.runInInjectionContext(() => new WalletUnlockLinkComponent());
    const event = { stopPropagation: vi.fn() } as unknown as Event;
    const pending = link.requestUnlock(event);
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(wallet.requestWalletUnlock).toHaveBeenCalledOnce();
    await link.requestUnlock(event);
    expect(wallet.requestWalletUnlock).toHaveBeenCalledOnce();
    cancel!(false);
    await pending;
    expect(link.pending).toBe(false);
  });

  it('does not reopen unlock for an already unlocked wallet', async () => {
    const wallet = { isLocked: () => false, requestWalletUnlock: vi.fn() };
    TestBed.configureTestingModule({ providers: [{ provide: WalletService, useValue: wallet }] });
    const link = TestBed.runInInjectionContext(() => new WalletUnlockLinkComponent());
    await link.requestUnlock(new Event('click'));
    expect(wallet.requestWalletUnlock).not.toHaveBeenCalled();
  });

  it('retains the notification action when building the visible toast', () => {
    const service = { notifications$: new BehaviorSubject(null), removeNotification$: new BehaviorSubject(null) };
    TestBed.configureTestingModule({ providers: [{ provide: NotificationService, useValue: service }] });
    const component = TestBed.runInInjectionContext(() => new NotificationsComponent());
    component.ngOnInit();
    service.notifications$.next({ type: 'warning', message: 'Incoming funds', options: { action: 'unlock-wallet', length: 0 } });
    expect(component.notifications[0].action).toBe('unlock-wallet');
  });
});


describe('password session unlock prompt', () => {
  it('locks the current session before requesting unlock and stops when locking is unavailable', async () => {
    const component: any = Object.create(ManageWalletComponent.prototype);
    const wallet = { lockWallet: vi.fn(() => true), requestWalletUnlock: vi.fn(async () => false) };
    component.walletService = wallet;
    await component.requestPasswordSession();
    expect(wallet.requestWalletUnlock).toHaveBeenCalledWith({ passwordOnly: true });
    expect(wallet.lockWallet).toHaveBeenCalledOnce();
    expect(wallet.requestWalletUnlock).toHaveBeenCalledOnce();
    wallet.lockWallet.mockReturnValue(false);
    await component.requestPasswordSession();
    expect(wallet.requestWalletUnlock).toHaveBeenCalledOnce();
  });
});
