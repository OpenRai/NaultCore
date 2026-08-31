import { TestBed } from '@angular/core/testing';
import { AppSettingsService } from './app-settings.service';
import { WebsocketService } from './websocket.service';

function partial<T extends object>(value: T): any {
  const jasmineApi = (globalThis as any).jasmine;
  return jasmineApi?.objectContaining ? jasmineApi.objectContaining(value) : (expect as any).objectContaining(value);
}

function installTestClock(): void {
  const jasmineApi = (globalThis as any).jasmine;
  if (jasmineApi?.clock) jasmineApi.clock().install();
  else vi.useFakeTimers();
}

function advanceTestClock(milliseconds: number): void {
  const jasmineApi = (globalThis as any).jasmine;
  if (jasmineApi?.clock) jasmineApi.clock().tick(milliseconds);
  else vi.advanceTimersByTime(milliseconds);
}

function uninstallTestClock(): void {
  const jasmineApi = (globalThis as any).jasmine;
  if (jasmineApi?.clock) jasmineApi.clock().uninstall();
  else vi.useRealTimers();
}

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];
  readonly sent: any[] = [];
  readyState = FakeWebSocket.CONNECTING;
  onopen: () => void;
  onerror: () => void;
  onclose: () => void;
  onmessage: (event: { data: unknown }) => void;

  constructor(readonly url: string) { FakeWebSocket.instances.push(this); }
  send(value: string): void { this.sent.push(JSON.parse(value)); }
  open(): void { this.readyState = FakeWebSocket.OPEN; this.onopen?.(); }
  message(value: unknown): void { this.onmessage?.({ data: JSON.stringify(value) }); }
  close(): void { this.readyState = FakeWebSocket.CLOSED; this.onclose?.(); }
}

describe('WebsocketService', () => {
  const settings = { settings: { serverWS: 'ws://node.test/websocket' } };
  let originalWebSocket: any;
  let service: WebsocketService;

  beforeEach(() => {
    originalWebSocket = (window as any).WebSocket;
    (window as any).WebSocket = FakeWebSocket;
    FakeWebSocket.instances = [];
    installTestClock();
    TestBed.configureTestingModule({
      providers: [WebsocketService, { provide: AppSettingsService, useValue: settings }],
    });
    service = TestBed.inject(WebsocketService);
    vi.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(() => {
    service?.ngOnDestroy();
    uninstallTestClock();
    (window as any).WebSocket = originalWebSocket;
  });

  function socket(): FakeWebSocket { return FakeWebSocket.instances[FakeWebSocket.instances.length - 1]; }
  function openSocket(): FakeWebSocket {
    service.connect();
    const current = socket();
    current.open();
    return current;
  }

  it('exposes connection and subscription state and acknowledges account subscriptions', () => {
    const connectionStates: string[] = [];
    const subscriptionStates: string[] = [];
    service.connectionState$.subscribe(state => connectionStates.push(state));
    service.subscriptionState$.subscribe(state => subscriptionStates.push(state));
    service.subscribeAccounts(['nano_one']);
    const current = openSocket();

    expect(connectionStates).toContain('connecting');
    expect(connectionStates).toContain('open');
    expect(current.sent[0]).toEqual(partial({
      action: 'subscribe', topic: 'confirmation', ack: true, options: { accounts: ['nano_one'] },
    }));
    expect(typeof current.sent[0].id).toBe('string');
    current.message({ ack: 'subscribe', id: current.sent[0].id, time: '1700000000' });
    expect(subscriptionStates[subscriptionStates.length - 1]).toBe('subscribed');
  });

  it('coalesces changes made while an acknowledgement is pending', () => {
    service.subscribeAccounts(['nano_one', 'nano_two']);
    const current = openSocket();
    const subscribe = current.sent[0];
    service.unsubscribeAccounts(['nano_two']);
    expect(current.sent.length).toBe(1);
    current.message({ ack: 'subscribe', id: subscribe.id });
    expect(current.sent.length).toBe(2);
    expect(current.sent[1]).toEqual(partial({
      action: 'unsubscribe', options: { accounts: ['nano_two'] }, ack: true,
    }));
  });

  it('replays the complete desired account set after reconnect and ignores stale socket events', () => {
    service.subscribeAccounts(['nano_one', 'nano_two']);
    const first = openSocket();
    const firstCommand = first.sent[0];
    first.message({ ack: 'subscribe', id: firstCommand.id });
    first.close();
    service.forceReconnect();
    const second = socket();
    first.open();
    second.open();
    expect(second.sent[0]).toEqual(partial({
      action: 'subscribe', options: { accounts: ['nano_one', 'nano_two'] }, ack: true,
    }));
  });

  it('surfaces protocol errors as recoverable failures', () => {
    const errors: string[] = [];
    service.protocolErrors$.subscribe(error => errors.push(error.message));
    const current = openSocket();
    service.subscribeAccounts(['nano_one']);
    const command = current.sent[0];
    current.message({ error: 'unsupported action', id: command.id });
    expect(errors).toEqual(['unsupported action']);
    expect(current.readyState).toBe(FakeWebSocket.CLOSED);

  });

  it('turns a missing subscription acknowledgement into a recoverable failure', () => {
      const states: string[] = [];
      service.connectionState$.subscribe(state => states.push(state));
      const current = openSocket();
      service.subscribeAccounts(['nano_one']);
      expect(current.sent.length).toBe(1);
      advanceTestClock(10_001);
      expect(states).toContain('error');
      expect(current.readyState).toBe(FakeWebSocket.CLOSED);
  });

  it('deduplicates confirmations by block hash and rejects malformed events', () => {
    const events: any[] = [];
    const errors: string[] = [];
    service.newTransactions$.subscribe(event => events.push(event));
    service.protocolErrors$.subscribe(error => errors.push(error.message));
    const current = openSocket();
    const confirmation = {
      topic: 'confirmation',
      message: { hash: 'ABC', amount: '1', block: { type: 'state', account: 'nano_one', subtype: 'send' } },
    };
    current.message(confirmation);
    current.message(confirmation);
    current.message({ topic: 'confirmation', message: { hash: 'bad' } });
    expect(events.length).toBe(1);
    expect(errors).toEqual(['Received an invalid confirmation message.']);
  });

  it('requires a pong after keepalive and tears down timers cleanly', () => {
      service.keepaliveTimeout = 100;
      service.pongTimeout = 100;
      const current = openSocket();
      advanceTestClock(100);
      expect(current.sent.some(message => message.action === 'ping')).toBe(true);
      advanceTestClock(101);
      expect(current.readyState).toBe(FakeWebSocket.CLOSED);
      const instanceCountAfterFailure = FakeWebSocket.instances.length;
      service.ngOnDestroy();
      advanceTestClock(60_000);
      expect(FakeWebSocket.instances.length).toBe(instanceCountAfterFailure);
  });
});
