import { Injectable, inject } from '@angular/core';
import { branding } from 'environments/branding';
import * as Rx from 'rxjs';
import { AudioFeedbackService, NotificationType } from './audio-feedback.service';

export type { NotificationType };

export interface NotificationCue {
  name: import('cuelume').SoundName;
  emphasis?: import('cuelume').Emphasis;
  backgroundOnly?: boolean;
}

export interface NotificationOptions {
  /** Replaces an existing toast with the same identifier instead of stacking. */
  identifier?: string;
  /** Auto-expire in ms. 0 keeps the toast until removeNotification(). */
  length?: number;
  /** Explicit cue, for outcomes that carry no identifier. */
  cue?: NotificationCue;
  [key: string]: unknown;
}

// Shared with NotificationsComponent so the auto-expire timer and the rendered
// toast can never drift apart.
export const DEFAULT_NOTIFICATION_LENGTH = 5000;

@Injectable()
export class NotificationService {

  notifications$ = new Rx.BehaviorSubject(null);
  removeNotification$ = new Rx.BehaviorSubject(null);

  private audio = inject(AudioFeedbackService);

  // Identifiers of toasts currently on screen. This is the single source of
  // truth for "is this toast already displayed", so that duplicate suppression
  // happens before anything downstream (the component, the audio hook) can act
  // on a toast the user never actually sees.
  //
  // It is a live set, not a "seen" log. `success-send` and `success-receive`
  // are reused on every single send/receive: call sites remove the toast and
  // immediately re-raise it under the same identifier. Tracking "identifiers
  // already seen" would silence the second send forever.
  private liveIdentifiers = new Set<string>();

  constructor() { }

  // This provides an entry point for all components to send notifications.
  // It exposes an observable that the actual component uses to grab new notifications

  sendNotification(type: NotificationType, message: string, options: NotificationOptions = {}) {
    const identifier = options.identifier || null;
    // `??` rather than hasOwnProperty so an explicit undefined falls back to the
    // default instead of skipping the expiry timer and suppressing the
    // identifier forever. A length of 0 is preserved: it means "persist".
    const length = options.length ?? DEFAULT_NOTIFICATION_LENGTH;

    // Drop duplicates before anything reacts to them, including the audio hook.
    if (identifier && this.liveIdentifiers.has(identifier)) {
      return;
    }

    if (identifier) {
      this.liveIdentifiers.add(identifier);
      // A length of 0 means the toast persists until removeNotification() is
      // called, so it must not get an expiry timer.
      if (length) {
        setTimeout(() => this.liveIdentifiers.delete(identifier), length);
      }
    }

    // Log all notifications to console for debugging/capture
    const logPrefix = '[Notification]';
    switch (type) {
      case 'error':
        console.error(logPrefix, '💥', message);
        break;
      case 'warning':
        console.warn(logPrefix, '⚠️', message);
        break;
      case 'success':
        console.info(logPrefix, '✅', message);
        break;
      case 'info':
      default:
        console.info(logPrefix, 'ℹ️', message);
        break;
    }

    this.audio.playForNotification(type, identifier, options);

    // Normalize `length` onto the options so the component does not have to
    // re-derive the default and drift from the expiry timer scheduled above.
    this.notifications$.next({ type, message, options: { ...options, length } });
  }

  removeNotification(identifier: string) {
    this.liveIdentifiers.delete(identifier);
    this.removeNotification$.next(identifier);
  }

  sendInfo(message: string, options: NotificationOptions = {}) {
    this.sendNotification('info', message, options);
  }
  sendSuccess(message: string, options: NotificationOptions = {}) {
    this.sendNotification('success', message, options);
  }
  sendWarning(message: string, options: NotificationOptions = {}) {
    this.sendNotification('warning', message, options);
  }
  sendError(message: string, options: NotificationOptions = {}) {
    this.sendNotification('error', message, options);
  }

  // Custom notification functions - these are re-used in multiple paces through the app
  sendLedgerChromeWarning() {
    this.sendWarning(
      `<b>Notice:</b> You may experience issues using a Ledger device with Google Chrome. ` +
      `If you do please use Brave/Opera browser or ` +
      `<a href="https://github.com/Nault/Nault/releases" target="_blank" rel="noopener noreferrer">${branding.applicationName} Desktop</a>.`,
      { length: 0, identifier: 'chrome-ledger' }
      );
  }

}