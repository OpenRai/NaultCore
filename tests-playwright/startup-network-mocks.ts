import type { Page, Route, WebSocketRoute } from '@playwright/test';

export interface StartupNetworkMockOptions {
  /** Seed for the bounded latency sequence. */
  seed?: number;
  /** Inclusive latency bounds applied only to mocked HTTP responses. */
  minLatencyMs?: number;
  maxLatencyMs?: number;
}

type RpcRequest = { action?: unknown; account?: unknown; accounts?: unknown; block?: unknown };
type MockAccountState = { balance: string; pending: string; frontier: string };
type MockLedgerState = { accounts: Map<string, MockAccountState>; nextBlock: number };

const DEFAULT_OPTIONS: Required<StartupNetworkMockOptions> = {
  seed: 0x4e41554c,
  minLatencyMs: 5,
  maxLatencyMs: 25,
};

const ZERO_FRONTIER = '0'.repeat(64);
const MOCK_REPRESENTATIVE = 'nano_1nnym1fi87ogqqb48ezizfhgfaewn1jmaaw4teaensu8fx9a615if4d96gpc';

function nextLatency(state: { value: number }, options: Required<StartupNetworkMockOptions>): number {
  // Small deterministic LCG: reproducible scheduling variation without wall-clock randomness.
  state.value = (Math.imul(state.value, 1664525) + 1013904223) >>> 0;
  const range = options.maxLatencyMs - options.minLatencyMs + 1;
  return options.minLatencyMs + (state.value % range);
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, milliseconds));
}

function accountsFrom(request: RpcRequest): string[] {
  if (Array.isArray(request.accounts)) {
    return request.accounts.filter((account): account is string => typeof account === 'string');
  }
  return typeof request.account === 'string' ? [request.account] : [];
}

function accountState(state: MockLedgerState, account: string): MockAccountState {
  const existing = state.accounts.get(account);
  if (existing) return existing;
  const created = { balance: '0', pending: '0', frontier: ZERO_FRONTIER };
  state.accounts.set(account, created);
  return created;
}

function rpcResponse(
  action: string | undefined,
  accounts: string[],
  state: MockLedgerState,
  request: RpcRequest,
): Record<string, unknown> | null {
  switch (action) {
    case 'accounts_balances':
      return {
        balances: Object.fromEntries(accounts.map(account => {
          const current = accountState(state, account);
          return [account, { balance: current.balance, pending: current.pending }];
        })),
      };
    case 'accounts_frontiers':
      return { frontiers: Object.fromEntries(accounts.map(account => [account, accountState(state, account).frontier])) };
    case 'accounts_pending':
      return { blocks: Object.fromEntries(accounts.map(account => {
        const current = accountState(state, account);
        return [account, current.pending === '0' ? {} : {
          [state.nextBlock.toString(16).padStart(64, '0')]: { amount: current.pending, source: MOCK_REPRESENTATIVE },
        }];
      })) };
    case 'account_info':
      {
        const current = accountState(state, accounts[0] ?? MOCK_REPRESENTATIVE);
        return {
          frontier: current.frontier,
          balance: current.balance,
          pending: current.pending,
          representative: MOCK_REPRESENTATIVE,
        };
      }
    case 'blocks_info':
      return { blocks: {} };
    case 'block_info':
      return { block_account: accounts[0] ?? MOCK_REPRESENTATIVE, confirmed: 'true' };
    case 'process':
      {
        let block: { account?: unknown; balance?: unknown } = {};
        if (typeof request.block === 'string') {
          try { block = JSON.parse(request.block) as { account?: unknown; balance?: unknown }; } catch { /* keep defaults */ }
        }
        if (typeof block.account === 'string') {
          const current = accountState(state, block.account);
          if (typeof block.balance === 'string') current.balance = block.balance;
          current.frontier = state.nextBlock.toString(16).padStart(64, '0');
        }
        const hash = state.nextBlock.toString(16).padStart(64, '0');
        state.nextBlock += 1;
        return { hash };
      }
    case 'block_count':
      return { count: '0', unchecked: '0', cemented: '0' };
    case 'representatives_online':
      return { representatives: [] };
    case 'confirmation_quorum':
      return {
        quorum_delta: '0',
        online_weight_quorum_percent: 67,
        online_weight_minimum: '0',
        online_stake_total: '0',
        trended_stake_total: '0',
        peers_stake_total: '0',
      };
    case 'version':
      return {
        rpc_version: 1,
        store_version: 1,
        protocol_version: 1,
        node_vendor: 'naultcore-playwright-mock',
        network: 'live',
        network_identifier: 'mock',
        build_info: 'playwright-fixture',
      };
    default:
      return null;
  }
}

async function handleHttpRoute(
  route: Route,
  latencyState: { value: number },
  ledgerState: MockLedgerState,
  options: Required<StartupNetworkMockOptions>,
): Promise<void> {
  const request = route.request();
  const url = request.url();

  if (request.method() === 'GET' && url.startsWith('https://api.coingecko.com/')) {
    await delay(nextLatency(latencyState, options));
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ market_data: { current_price: {
        usd: 1, btc: 0.00001, aud: 1, brl: 1, cad: 1, chf: 1, clp: 1, cny: 1,
        czk: 1, dkk: 1, eur: 1, gbp: 1, hkd: 1, huf: 1, idr: 1, ils: 1,
        inr: 1, jpy: 1, krw: 1, mxn: 1, myr: 1, nok: 1, nzd: 1, php: 1,
        pkr: 1, pln: 1, rub: 1, sek: 1, sgd: 1, thb: 1, try: 1, twd: 1, zar: 1,
      } } }),
    });
    return;
  }

  if (request.method() !== 'POST' || !url.startsWith('https://')) {
    await route.fallback();
    return;
  }

  let body: RpcRequest;
  try {
    body = request.postDataJSON() as RpcRequest;
  } catch {
    await route.fallback();
    return;
  }

  const response = rpcResponse(typeof body.action === 'string' ? body.action : undefined, accountsFrom(body), ledgerState, body);
  if (!response) {
    await route.fallback();
    return;
  }

  await delay(nextLatency(latencyState, options));
  await route.fulfill({
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(response),
  });
}

function handleWebSocketRoute(websocket: WebSocketRoute): void {
  websocket.onMessage(message => {
    if (typeof message !== 'string') return;
    let request: { action?: unknown; id?: unknown };
    try {
      request = JSON.parse(message) as { action?: unknown; id?: unknown };
    } catch {
      return;
    }

    if (request.action === 'ping') {
      websocket.send(JSON.stringify({ ack: 'pong', time: '1700000000' }));
      return;
    }
    if (request.action === 'subscribe' || request.action === 'unsubscribe') {
      websocket.send(JSON.stringify({ ack: request.action, id: request.id, time: '1700000000' }));
    }
  });
}

/** Install deterministic startup mocks before the first page navigation. */
export async function installStartupNetworkMocks(
  page: Page,
  overrides: StartupNetworkMockOptions = {},
): Promise<void> {
  const options = { ...DEFAULT_OPTIONS, ...overrides };
  if (options.minLatencyMs < 0 || options.maxLatencyMs < options.minLatencyMs) {
    throw new Error('Startup mock latency bounds are invalid.');
  }
  const state = { value: options.seed >>> 0 };
  const ledgerState: MockLedgerState = { accounts: new Map(), nextBlock: 1 };
  await page.route('**/*', route => handleHttpRoute(route, state, ledgerState, options));
  await page.routeWebSocket('wss://**/*', handleWebSocketRoute);
}

/** Install a deterministic failure scenario for startup network diagnostics. */
export async function installUnavailableStartupNetwork(page: Page): Promise<void> {
  await page.route('**/*', async route => {
    if (route.request().url().startsWith('https://')) {
      await route.abort('failed');
      return;
    }
    await route.fallback();
  });
  await page.routeWebSocket('wss://**/*', websocket => websocket.close({
    code: 1001,
    reason: 'simulated unavailable network',
  }));
}
