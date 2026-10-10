import { Injectable, inject } from '@angular/core';
import { play, setEnabled, setVolume, type Emphasis, type SoundName } from 'cuelume';
import { AppSettingsService } from './app-settings.service';

export type NotificationType = 'info'|'success'|'warning'|'error';

/**
 * The cues that are allowed to make a sound, keyed by `type:identifier`.
 *
 * Keying on the pair matters because identifiers are not self-describing:
 * `account-added` reads like a success but is actually a duplicate warning
 * (multisig.component.ts). Keying on the bare identifier would mis-fire.
 *
 * Everything not listed here is silent on purpose. The app has ~300
 * notification call sites, including loops that fire once per account
 * (sweeper, stealth opening) and once per tracked transaction. A type-to-cue
 * mapping would turn all of that into noise.
 */
const CUES: Record<string, { cue: SoundName; emphasis: Emphasis; backgroundOnly?: boolean }> = {
  // Per cuelume, cues are picked by the job and never reused across jobs:
  // money confirmed out (success), money arrived or waiting (ready), wallet
  // blocked on the user (attention). Received funds are the one event the
  // user is most likely to hear while looking elsewhere, so sends and
  // receives must never share a cue.
  'success:success-send': { cue: 'success', emphasis: 'strong' },
  // Funds landed and the wallet claimed them: a result is there, nothing
  // more the user must do, so this is `ready`, not `success`.
  'success:success-receive': { cue: 'ready', emphasis: 'strong' },
  // Stealth opens are driven by incoming Nostr/OrbitDB notifications, so this
  // is usually a background arrival. Only speak up when the tab is hidden.
  'success:success-receive-nanonym': { cue: 'ready', emphasis: 'strong', backgroundOnly: true },
  // Incoming funds that still need action: the wallet is locked so the
  // receive cannot be processed, or receives are manual. Blocked until the
  // user answers, so this is `attention`: one high glass bell.
  'warning:pending-locked': { cue: 'attention', emphasis: 'normal' },
  // A stealth payment was spotted but its receive still has to run. Same job
  // as pending-locked: money waiting on the user, announced while hidden.
  'info:incoming-nanonym-payment': { cue: 'attention', emphasis: 'normal', backgroundOnly: true },
  // Frequent but meaningful: confirms the tap actually registered.
  'success:success-copied': { cue: 'success', emphasis: 'subtle' },
  // The wallet latch. `open` and `close` are cuelume's designed counterparts
  // (air rising over a light mallet note / air falling shut over a low damped
  // one), so unlocking and locking are audibly opposite and neither collides
  // with the glass or mallet outcomes above.
  'success:wallet-unlocked': { cue: 'open', emphasis: 'normal' },
  'success:wallet-locked': { cue: 'close', emphasis: 'normal' },
  // A refused unlock and a failed lock are both failures to act, which is
  // cuelume's `error` job, so a wrong password is no longer silent while a
  // correct one answers.
  'error:wrong-password': { cue: 'error', emphasis: 'normal' },
  'error:wallet-lock-failed': { cue: 'error', emphasis: 'normal' },
  // The wallet is stalled waiting on a device the user may not be looking at.
  'info:ledger-sign': { cue: 'attention', emphasis: 'normal' },
  // A Ledger signing step cannot continue.
  'warning:wrong-input': { cue: 'error', emphasis: 'normal' },
};

// Collapses bursts from loops and double-taps. Long enough to swallow a rapid
// repeat, short enough that two genuinely distinct events 1.5s apart (pending
// receives are processed on a 1.5s timer) each get their own cue.
const COOLDOWN_MS = 300;

@Injectable()
export class AudioFeedbackService {
  private settings = inject(AppSettingsService);

// null means "nothing has played yet". Initialising this to 0 would make the
// first cue a no-op whenever the clock reads 0.
private lastPlayedAt: number | null = null;
private enabled = true;

  /**
   * Applies the user's persisted preference. Cuelume deliberately does not
   * persist anything, so the app owns this setting.
   */
  syncPreference() {
    // Read the field directly: AppSettingsService.getAppSetting() returns null
    // for any falsy value, which would make `false` indistinguishable from unset.
    this.enabled = this.settings.settings.soundEnabled !== false;
    setEnabled(this.enabled);
  }

  isEnabled() {
    return this.enabled;
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    setEnabled(enabled);
  }

  setVolume(volume: number) {
    setVolume(volume);
  }

  /**
   * Plays the cue for a notification, if any. Called for every notification the
   * service actually raises, after duplicate suppression.
   */
  playForNotification(type: NotificationType, identifier: string | null, options: any) {
    // An explicit cue on the call site wins over the allowlist. Needed for
    // outcomes that carry no identifier, such as a denied Ledger signature.
    if (options?.cue) {
      this.playCue(options.cue.name, options.cue.emphasis ?? 'normal', !!options.cue.backgroundOnly);
      return;
    }

    if (!identifier) {
      return;
    }

    const entry = CUES[`${type}:${identifier}`];
    if (!entry) {
      return;
    }

    this.playCue(entry.cue, entry.emphasis, !!entry.backgroundOnly);
  }

  /**
   * Plays a cue for a confirmed outcome that has no toast of its own.
   * Money movement goes through here so that audio is tied to the transaction
   * boundary rather than to toast text, which a refactor could move or drop.
   */
  playOutcome(cue: SoundName, emphasis: Emphasis = 'strong') {
    this.playCue(cue, emphasis, false);
  }

  private playCue(cue: SoundName, emphasis: Emphasis, backgroundOnly: boolean) {
    if (!this.enabled) {
      return;
    }

    const now = Date.now();
    if (this.lastPlayedAt !== null && now - this.lastPlayedAt < COOLDOWN_MS) {
      return;
    }

    // Nothing to announce to a user who is already looking at the toast.
    const hidden = typeof document !== 'undefined' && document.hidden;
    if (backgroundOnly && !hidden) {
      return;
    }

    this.lastPlayedAt = now;

    // play() is documented as a silent no-op when Web Audio is unavailable or
    // autoplay is blocked, but guard anyway: audio must never break a wallet.
    try {
      play(cue, { emphasis });
    } catch (error) {
      console.warn('[AudioFeedback] Cue failed to play', error);
    }
  }
}