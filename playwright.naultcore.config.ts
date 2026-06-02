import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.test' });

const browserBin = process.env.CHROME_BIN || undefined;

export default defineConfig({
  testDir: './tests-playwright',
  fullyParallel: true,
  forbidOnly: false,
  retries: 0,
  workers: undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'on-first-retry',
    headless: false,
  },
  projects: [
    {
      name: 'Chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(browserBin ? { launchOptions: { executablePath: browserBin } } : {}),
      },
    },
  ],
  webServer: {
    command: 'unset npm_config_prefix && /bin/zsh -lc "source ~/.nvm/nvm.sh && FEATURE_NANONYMS=false nvm exec pnpm exec ng serve --configuration naultcore"',
    url: 'http://localhost:4200',
    reuseExistingServer: true,
    timeout: 180000,
  },
});
