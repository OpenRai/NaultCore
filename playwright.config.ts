import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

// Load .env.test (gitignored) — contains NANO_TEST_SEED and optional CHROME_BIN.
// Falls back gracefully if the file doesn't exist (CI uses secrets instead).
dotenv.config({ path: '.env.test' });

const isCI = !!process.env.CI;
const browserBin = process.env.CHROME_BIN || undefined;

export default defineConfig({
  testDir: './tests-playwright',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'on-first-retry',
    // Local: see the browser. CI: headless.
    headless: isCI,
  },
  projects: [
    {
      name: 'Chromium',
      use: {
        ...devices['Desktop Chrome'],
        // In CI: no executablePath -> Playwright uses its bundled Chromium.
        // Locally: CHROME_BIN from .env.test or shell env (e.g. Brave Browser).
        ...(browserBin ? { launchOptions: { executablePath: browserBin } } : {}),
      },
    },
  ],
  webServer: {
    // CI: pnpm is installed by the workflow.
    // Local: use nvm wrapper (AGENTS.md convention).
    command: isCI
      ? 'pnpm start'
      : 'unset npm_config_prefix && /bin/zsh -lc "source ~/.nvm/nvm.sh && nvm exec pnpm start"',
    url: 'http://localhost:4200',
    reuseExistingServer: !isCI,
    timeout: 180000,
  },
});
