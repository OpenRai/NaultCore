import { Injectable, OnDestroy, inject } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { AppSettingsService } from './app-settings.service';

export type WebsocketConnectionState =
  | 'idle' | 'connecting' | 'open' | 'reconnecting' | 'paused' | 'error' | 'closed';
export type WebsocketSubscriptionState = 'idle' | 'pending' | 'subscribed' | 'error';

export interface NanoConfirmationMessage {
  hash: string;
  amount: string;
  block: {
    type: string;
    subtype?: string;
    account: string;
    link_as_account?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface WebsocketProtocolError {
  message: string;
  raw?: unknown;
}

interface SubscriptionCommand {
  action: 'subscribe' | 'unsubscribe';
  topic: 'confirmation';
  options: { accounts: string[] };
  ack: true;
  id: string;
}

interface PendingAck {
  command: SubscriptionCommand;
  generation: number;
  timeout: ReturnType<typeof setTimeout>;
}

const MAX_BACKOFF_MS = 30_000;
const ACK_TIMEOUT_MS = 10_000;
const PONG_TIMEOUT_MS = 15_000;
const STABLE_CONNECTION_MS = 10_000;
const MAX_DEDUPLICATED_HASHES = 2_000;

@Injectable()
export class WebsocketService implements OnDestroy {
  private readonly appSettings = inject(AppSettingsService);

  private readonly connectionStateSubject = new BehaviorSubject<WebsocketConnectionState>('idle');
  readonly connectionState$ = this.connectionStateSubject.asObservable();
  private readonly subscriptionStateSubject = new BehaviorSubject<WebsocketSubscriptionState>('idle');
  readonly subscriptionState$ = this.subscriptionStateSubject.asObservable();
  private readonly protocolErrorSubject = new Subject<WebsocketProtocolError>();
  readonly protocolErrors$ = this.protocolErrorSubject.asObservable();

  /** WalletService uses this as a hint to perform authoritative RPC reconciliation. */
  readonly reconciliationRequested$ = new Subject<{ reason: 'reconnect' | 'resume' }>();
  /** Confirmations are transport hints; consumers must reconcile through WalletService/RPC. */
  readonly newTransactions$ = new Subject<NanoConfirmationMessage>();

  // Compatibility surface retained for existing diagnostics and callers.
  readonly socket: { connected: boolean; ws: WebSocket | null } = { connected: false, ws: null };
  readonly queuedCommands: SubscriptionCommand[] = [];
  readonly subscribedAccounts: string[] = [];
  keepaliveTimeout = 60 * 1000;
  pongTimeout = PONG_TIMEOUT_MS;
  reconnectTimeout = 5 * 1000;
  keepaliveSet = false;

  private desiredAccounts = new Set<string>();
  private acknowledgedAccounts = new Set<string>();
  private pendingAck: PendingAck | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private keepaliveTimer: ReturnType<typeof setTimeout> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private stableConnectionTimer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;
  private commandSequence = 0;
  private reconnectAttempt = 0;
  private destroyed = false;
  private suspended = false;
  private wasOpenBeforeSuspend = false;
  private seenConfirmationHashes = new Set<string>();

  private readonly onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') this.pause('hidden');
    else this.resume('visibility');
  };
  private readonly onPageShow = () => this.resume('pageshow');
  private readonly onOnline = () => this.resume('online');
  private readonly onOffline = () => this.pause('offline');

  constructor() {
    if (typeof window !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibilityChange);
      window.addEventListener('pageshow', this.onPageShow);
      window.addEventListener('online', this.onOnline);
      window.addEventListener('offline', this.onOffline);
      if (!navigator.onLine || document.visibilityState === 'hidden') this.suspended = true;
    }
  }

  connect(): void {
    if (this.destroyed || this.suspended) return;
    if (this.socket.ws && (this.socket.ws.readyState === WebSocket.OPEN || this.socket.ws.readyState === WebSocket.CONNECTING)) return;

    const wsUrl = this.appSettings.settings.serverWS;
    if (!wsUrl) {
      this.setConnectionState('idle');
      return;
    }
    // Nano V27+ expects secure access through a reverse proxy; ws:// is local-development only.
    if (typeof location !== 'undefined' && location.protocol === 'https:' && wsUrl.startsWith('ws://')) {
      this.failProtocol('Refusing an insecure ws:// endpoint from an HTTPS deployment. Use a WSS reverse proxy.');
      return;
    }

    this.clearReconnectTimer();
    this.clearSocketTimers();
    const ws = new WebSocket(wsUrl);
    const socketGeneration = ++this.generation;
    this.socket.ws = ws;
    this.socket.connected = false;
    this.setConnectionState(this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting');

    ws.onopen = () => {
      if (!this.isCurrentSocket(ws, socketGeneration)) return;
      this.socket.connected = true;
      this.setConnectionState('open');
      this.scheduleStableBackoffReset(socketGeneration);
      this.acknowledgedAccounts.clear();
      this.subscriptionStateSubject.next(this.desiredAccounts.size ? 'pending' : 'subscribed');
      this.reconcileSubscriptions(socketGeneration);
      this.scheduleKeepalive(socketGeneration);
      if (this.wasOpenBeforeSuspend) this.reconciliationRequested$.next({ reason: 'reconnect' });
      this.wasOpenBeforeSuspend = false;
    };
    ws.onerror = () => {
      if (!this.isCurrentSocket(ws, socketGeneration)) return;
      this.setConnectionState('error');
      try { ws.close(); } catch { /* close handler schedules recovery */ }
    };
    ws.onclose = () => {
      if (!this.isCurrentSocket(ws, socketGeneration)) return;
      this.socket.connected = false;
      this.clearSocketTimers();
      this.cancelPendingAck();
      this.acknowledgedAccounts.clear();
      this.setConnectionState(this.suspended ? 'paused' : 'error');
      if (!this.suspended && !this.destroyed) this.scheduleReconnect();
    };
    ws.onmessage = event => {
      if (this.isCurrentSocket(ws, socketGeneration)) this.handleMessage(event.data, socketGeneration);
    };
  }

  forceReconnect(): void {
    if (this.destroyed) return;
    this.clearReconnectTimer();
    this.clearSocketTimers();
    this.cancelPendingAck();
    this.acknowledgedAccounts.clear();
    const oldSocket = this.socket.ws;
    this.socket.ws = null;
    this.socket.connected = false;
    ++this.generation;
    if (oldSocket) {
      try { oldSocket.close(); } catch { /* already closed */ }
    }
    this.reconnectAttempt = 0;
    this.setConnectionState(this.suspended ? 'paused' : 'reconnecting');
    if (!this.suspended) this.reconnectTimer = setTimeout(() => this.connect(), 0);
  }

  subscribeAccounts(accountIDs: string[]): void {
    for (const account of accountIDs) if (typeof account === 'string' && account.length) this.desiredAccounts.add(account);
    this.syncDesiredAccounts();
    this.reconcileSubscriptions(this.generation);
  }

  unsubscribeAccounts(accountIDs: string[]): void {
    for (const account of accountIDs) this.desiredAccounts.delete(account);
    this.syncDesiredAccounts();
    this.reconcileSubscriptions(this.generation);
  }

  /** Pause reconnect and heartbeat work while hidden/offline without losing desired subscriptions. */
  pause(_reason: 'hidden' | 'offline' = 'hidden'): void {
    if (this.destroyed || this.suspended) return;
    this.suspended = true;
    this.wasOpenBeforeSuspend = this.connectionStateSubject.value === 'open';
    this.clearReconnectTimer();
    this.clearSocketTimers();
    this.cancelPendingAck();
    this.setConnectionState('paused');
  }

  /** Resume foreground work, perform one liveness check, and request wallet reconciliation. */
  resume(_reason: 'visibility' | 'pageshow' | 'online' = 'visibility'): void {
    if (this.destroyed || !this.suspended) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    this.suspended = false;
    this.reconciliationRequested$.next({ reason: 'resume' });
    if (this.socket.ws && this.socket.ws.readyState === WebSocket.OPEN) {
      this.sendPing(this.generation);
      this.scheduleKeepalive(this.generation);
      this.reconcileSubscriptions(this.generation);
    } else {
      this.connect();
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.clearReconnectTimer();
    this.clearSocketTimers();
    this.cancelPendingAck();
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisibilityChange);
    if (typeof window !== 'undefined') {
      window.removeEventListener('pageshow', this.onPageShow);
      window.removeEventListener('online', this.onOnline);
      window.removeEventListener('offline', this.onOffline);
    }
    const ws = this.socket.ws;
    this.socket.ws = null;
    this.socket.connected = false;
    if (ws) {
      try { ws.close(); } catch { /* teardown is complete */ }
    }
    this.setConnectionState('closed');
  }

  private handleMessage(raw: unknown, socketGeneration: number): void {
    let message: any;
    try { message = typeof raw === 'string' ? JSON.parse(raw) : raw; }
    catch { this.failProtocol('Received a non-JSON WebSocket message.', raw); return; }
    if (!message || typeof message !== 'object') { this.failProtocol('Received an invalid WebSocket message.', raw); return; }
    if (message.time !== undefined) message.time = this.normalizeTimestamp(message.time);

    if (message.ack === 'pong') { this.clearPongTimer(); return; }
    if (message.ack === 'subscribe' || message.ack === 'unsubscribe') {
      this.handleSubscriptionAck(message, socketGeneration);
      return;
    }
    if (message.error !== undefined) { this.handleProtocolErrorMessage(message); return; }
    if (message.topic === 'confirmation') {
      const confirmation = message.message as NanoConfirmationMessage;
      if (!this.isConfirmation(confirmation)) { this.failProtocol('Received an invalid confirmation message.', raw); return; }
      if (this.seenConfirmationHashes.has(confirmation.hash)) return;
      this.seenConfirmationHashes.add(confirmation.hash);
      if (this.seenConfirmationHashes.size > MAX_DEDUPLICATED_HASHES) {
        const oldest = this.seenConfirmationHashes.values().next().value;
        this.seenConfirmationHashes.delete(oldest);
      }
      this.newTransactions$.next(confirmation);
      return;
    }
    this.failProtocol('Received an unsupported WebSocket message.', raw);
  }

  private handleSubscriptionAck(message: any, socketGeneration: number): void {
    const pending = this.pendingAck;
    if (!pending || pending.generation !== socketGeneration || message.id !== pending.command.id || message.ack !== pending.command.action) {
      this.failProtocol('Received an unsolicited or mismatched subscription acknowledgement.', message);
      return;
    }
    clearTimeout(pending.timeout);
    this.pendingAck = null;
    for (const account of pending.command.options.accounts) {
      if (pending.command.action === 'subscribe') this.acknowledgedAccounts.add(account);
      else this.acknowledgedAccounts.delete(account);
    }
    this.subscriptionStateSubject.next('pending');
    this.reconcileSubscriptions(socketGeneration);
  }

  private reconcileSubscriptions(socketGeneration: number): void {
    const ws = this.socket.ws;
    if (!ws || !this.socket.connected || ws.readyState !== WebSocket.OPEN || socketGeneration !== this.generation || this.suspended || this.pendingAck) return;
    const toRemove = [...this.acknowledgedAccounts].filter(account => !this.desiredAccounts.has(account));
    const toAdd = [...this.desiredAccounts].filter(account => !this.acknowledgedAccounts.has(account));
    if (toRemove.length) this.sendSubscriptionCommand('unsubscribe', toRemove, socketGeneration);
    else if (toAdd.length) this.sendSubscriptionCommand('subscribe', toAdd, socketGeneration);
    else this.subscriptionStateSubject.next('subscribed');
  }

  private sendSubscriptionCommand(action: 'subscribe' | 'unsubscribe', accounts: string[], socketGeneration: number): void {
    const ws = this.socket.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const command: SubscriptionCommand = {
      action, topic: 'confirmation', options: { accounts: [...accounts] }, ack: true,
      id: `naultcore-${++this.commandSequence}`,
    };
    this.subscriptionStateSubject.next('pending');
    const timeout = setTimeout(() => {
      if (this.pendingAck?.command.id !== command.id) return;
      this.pendingAck = null;
      this.subscriptionStateSubject.next('error');
      this.failConnection('Subscription acknowledgement timed out.');
    }, ACK_TIMEOUT_MS);
    this.pendingAck = { command, generation: socketGeneration, timeout };
    try { ws.send(JSON.stringify(command)); }
    catch {
      clearTimeout(timeout);
      this.pendingAck = null;
      this.subscriptionStateSubject.next('error');
      this.failConnection('Unable to send a subscription command.');
    }
  }

  private sendPing(socketGeneration: number): void {
    const ws = this.socket.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN || socketGeneration !== this.generation || this.suspended) return;
    try {
      ws.send(JSON.stringify({ action: 'ping' }));
      this.clearPongTimer();
      this.pongTimer = setTimeout(() => {
        if (this.socket.connected && socketGeneration === this.generation) this.failConnection('WebSocket pong deadline exceeded.');
      }, this.pongTimeout);
    } catch { this.failConnection('Unable to send WebSocket keepalive.'); }
  }

  private scheduleKeepalive(socketGeneration: number): void {
    this.clearKeepaliveTimer();
    this.keepaliveSet = true;
    this.keepaliveTimer = setTimeout(() => {
      if (!this.suspended && this.socket.connected && socketGeneration === this.generation) {
        this.sendPing(socketGeneration);
        if (this.socket.connected && socketGeneration === this.generation) this.scheduleKeepalive(socketGeneration);
      }
    }, this.keepaliveTimeout);
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    this.reconnectAttempt += 1;
    const exponentialDelay = Math.min(MAX_BACKOFF_MS, this.reconnectTimeout * Math.pow(2, this.reconnectAttempt - 1));
    const delay = Math.floor(Math.random() * (exponentialDelay + 1));
    this.setConnectionState('reconnecting');
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private scheduleStableBackoffReset(socketGeneration: number): void {
    if (this.stableConnectionTimer) clearTimeout(this.stableConnectionTimer);
    this.stableConnectionTimer = setTimeout(() => {
      if (socketGeneration !== this.generation || !this.socket.connected) return;
      this.reconnectAttempt = 0;
      this.reconnectTimeout = 5 * 1000;
    }, STABLE_CONNECTION_MS);
  }

  private failConnection(reason: string): void {
    this.setConnectionState('error');
    const ws = this.socket.ws;
    if (ws) {
      try { ws.close(); } catch { /* close handler owns recovery */ }
    } else if (!this.suspended) this.scheduleReconnect();
    void reason;
  }

  private failProtocol(message: string, raw?: unknown): void {
    this.protocolErrorSubject.next({ message, raw });
    this.failConnection(message);
  }

  private handleProtocolErrorMessage(message: any): void {
    const error = typeof message.error === 'string' ? message.error : 'Nano node reported a WebSocket protocol error.';
    this.protocolErrorSubject.next({ message: error, raw: message });
    if (this.pendingAck && (!message.id || message.id === this.pendingAck.command.id)) {
      clearTimeout(this.pendingAck.timeout);
      this.pendingAck = null;
      this.subscriptionStateSubject.next('error');
    }
    this.failConnection(error);
  }

  private syncDesiredAccounts(): void {
    this.subscribedAccounts.splice(0, this.subscribedAccounts.length, ...this.desiredAccounts);
  }
  private isCurrentSocket(ws: WebSocket, socketGeneration: number): boolean {
    return !this.destroyed && this.socket.ws === ws && this.generation === socketGeneration;
  }
  private isConfirmation(message: unknown): message is NanoConfirmationMessage {
    const candidate = message as NanoConfirmationMessage;
    return !!candidate && typeof candidate === 'object' && typeof candidate.hash === 'string' && candidate.hash.length > 0
      && typeof candidate.amount === 'string' && !!candidate.block && typeof candidate.block === 'object'
      && typeof candidate.block.account === 'string' && typeof candidate.block.type === 'string';
  }
  private normalizeTimestamp(time: unknown): string {
    const value = String(time);
    const number = Number.parseInt(value, 10);
    return number < 10_000_000_000 ? String(number * 1000) : value;
  }
  private setConnectionState(state: WebsocketConnectionState): void {
    if (this.connectionStateSubject.value !== state) this.connectionStateSubject.next(state);
  }
  private clearReconnectTimer(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }
  private clearKeepaliveTimer(): void {
    if (this.keepaliveTimer) clearTimeout(this.keepaliveTimer);
    this.keepaliveTimer = null;
    this.keepaliveSet = false;
  }
  private clearPongTimer(): void {
    if (this.pongTimer) clearTimeout(this.pongTimer);
    this.pongTimer = null;
  }
  private clearSocketTimers(): void {
    this.clearKeepaliveTimer();
    this.clearPongTimer();
    if (this.stableConnectionTimer) clearTimeout(this.stableConnectionTimer);
    this.stableConnectionTimer = null;
  }
  private cancelPendingAck(): void {
    if (this.pendingAck) clearTimeout(this.pendingAck.timeout);
    this.pendingAck = null;
  }
}
