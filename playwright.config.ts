import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import { e2eStorageStatePath, getE2ETestWallet } from './tests-playwright/test-wallet';

// Load .env.test (gitignored) — contains NANO_TEST_SEED and optional CHROME_BIN.
// Falls back gracefully if the file doesn't exist (CI uses secrets instead).
dotenv.config({ path: '.env.test', quiet: true });
dotenv.config({ path: '.env', quiet: true });
const featureNanonyms = process.env.FEATURE_NANONYMS === 'true';
process.env.FEATURE_NANONYMS = featureNanonyms ? 'true' : 'false';
getE2ETestWallet();

const isCI = !!process.env.CI;
const browserBin = process.env.CHROME_BIN || undefined;

function getWebServerCommand(): string {
  const featureFlag = featureNanonyms ? 'true' : 'false';
  return isCI
    ? `FEATURE_NANONYMS=${featureFlag} pnpm exec ng serve --configuration naultcore-e2e`
    : `unset npm_config_prefix && /bin/zsh -lc "source ~/.nvm/nvm.sh && FEATURE_NANONYMS=${featureFlag} nvm exec pnpm exec ng serve --configuration naultcore-e2e"`;
}

export default defineConfig({
  testDir: './tests-playwright',
  // All browser contexts are isolated, but funded Nano accounts live on one
  // chain. Run their transactions serially to avoid frontier races/retries.
  fullyParallel: false,
  forbidOnly: isCI,
  retries: 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:4200',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    // Local: see the browser. CI: headless.
    headless: isCI,
  },
  projects: [
    {
      name: 'wallet setup',
      testMatch: /.*\.setup\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        headless: true,
        ...(browserBin ? { launchOptions: { executablePath: browserBin } } : {}),
      },
    },
    {
      name: 'Chromium',
      dependencies: ['wallet setup'],
      testIgnore: /.*\.setup\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: e2eStorageStatePath,
        // In CI: no executablePath -> Playwright uses its bundled Chromium.
        // Locally: CHROME_BIN from .env.test or shell env (e.g. Brave Browser).
        ...(browserBin ? { launchOptions: { executablePath: browserBin } } : {}),
      },
    },
  ],
  webServer: {
    // CI: pnpm is installed by the workflow.
    // Local: use nvm wrapper (AGENTS.md convention).
    command: getWebServerCommand(),
    url: 'http://localhost:4200',
    reuseExistingServer: !isCI,
    timeout: 180000,
  },
});
