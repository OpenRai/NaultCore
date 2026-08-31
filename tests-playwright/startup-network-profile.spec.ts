import { writeFileSync } from 'node:fs';
import { test, expect, unlockWalletThroughBridge } from './fixtures';

test.use({ startupNetworkMode: 'live' });

/**
 * Opt-in startup network profiler.
 *
 * This is intentionally skipped during normal E2E runs. Enable it with:
 *
 *   source ~/.nvm/nvm.sh && PROFILE_STARTUP_NETWORK_E2E=true \
 *     nvm exec pnpm exec playwright test tests-playwright/startup-network-profile.spec.ts \
 *     --project=Chromium --trace on
 *
 * The report contains request URLs, RPC action names, status/timing, and
 * sanitized WebSocket metadata only. It must never record wallet/account
 * payloads, work values, or raw WebSocket frames.
 */
const profileEnabled = process.env.PROFILE_STARTUP_NETWORK_E2E === 'true';
test.skip(!profileEnabled, 'Set PROFILE_STARTUP_NETWORK_E2E=true to run the startup profiler');

type RequestProfile = {
  method: string;
  url: string;
  action: string | null;
  startedAtMs: number;
  durationMs?: number;
  status: number | 'failed' | 'pending';
};

type FrameProfile = {
  action?: string;
  ack?: string;
  topic?: string;
  type?: string;
  accountsCount?: number;
  payload: 'json' | 'non-json' | 'binary' | 'unsupported';
};

type WebSocketProfile = {
  url: string;
  sent: FrameProfile[];
  received: FrameProfile[];
};

function summarizeFrame(payload: unknown): FrameProfile {
  let text: string | null = null;

  if (typeof payload === 'string') {
    text = payload;
  } else if (Buffer.isBuffer(payload)) {
    text = payload.toString('utf8');
  } else if (payload instanceof ArrayBuffer) {
    text = Buffer.from(payload).toString('utf8');
  } else if (payload && typeof payload === 'object') {
    // Playwright may expose a Node Buffer as its serialized JSON shape.
    const encoded = payload as { type?: unknown; data?: unknown };
    if (encoded.type === 'Buffer' && Array.isArray(encoded.data)) {
      text = Buffer.from(encoded.data as number[]).toString('utf8');
    }
  }

  if (text === null) return { payload: 'unsupported' };

  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const summary: FrameProfile = { payload: 'json' };
    for (const key of ['action', 'ack', 'topic', 'type'] as const) {
      if (typeof parsed[key] === 'string') summary[key] = parsed[key];
    }
    const accounts = (parsed.options as { accounts?: unknown } | undefined)?.accounts;
    if (Array.isArray(accounts)) summary.accountsCount = accounts.length;
    return summary;
  } catch {
    return { payload: text.length ? 'non-json' : 'binary' };
  }
}

test('profiles encrypted-wallet startup network activity', async ({ page, testWallet }, testInfo) => {
  const started = Date.now();
  const requests: RequestProfile[] = [];
  const requestMap = new Map<object, RequestProfile>();
  const websockets: WebSocketProfile[] = [];

  page.on('request', request => {
    if (!request.url().startsWith('https://')) return;

    let action: string | null = null;
    try {
      const body = request.postDataJSON() as Record<string, unknown>;
      if (typeof body.action === 'string') action = body.action;
    } catch {
      // GETs and non-JSON requests have no RPC action.
    }

    const profile: RequestProfile = {
      method: request.method(),
      url: request.url(),
      action,
      startedAtMs: Date.now() - started,
      status: 'pending',
    };
    requests.push(profile);
    requestMap.set(request, profile);
  });

  page.on('response', response => {
    const profile = requestMap.get(response.request());
    if (!profile) return;
    profile.status = response.status();
    profile.durationMs = Date.now() - started - profile.startedAtMs;
  });

  page.on('requestfailed', request => {
    const profile = requestMap.get(request);
    if (!profile) return;
    profile.status = 'failed';
    profile.durationMs = Date.now() - started - profile.startedAtMs;
  });

  page.on('websocket', socket => {
    if (!socket.url().startsWith('wss://')) return;
    const profile: WebSocketProfile = { url: socket.url(), sent: [], received: [] };
    websockets.push(profile);
    socket.on('framesent', ({ payload }) => profile.sent.push(summarizeFrame(payload)));
    socket.on('framereceived', ({ payload }) => profile.received.push(summarizeFrame(payload)));
  });

  await page.goto('/accounts');
  await expect(page.locator('text=Wallet Locked')).toBeVisible({ timeout: 15000 });
  await unlockWalletThroughBridge(page);
  await expect(page.locator('[data-testid="accounts-page-root"]')).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(2500);

  writeFileSync(testInfo.outputPath('startup-network-profile.json'), JSON.stringify({
    elapsedMs: Date.now() - started,
    requests,
    websockets,
  }, null, 2));
});
