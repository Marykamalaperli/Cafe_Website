import { defineConfig } from '@playwright/test';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const databaseFolder = mkdtempSync(join(tmpdir(), 'bitesbro-browser-'));
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  timeout: 30000,
  outputDir: './test-results',
  use: {
    baseURL: 'http://127.0.0.1:3100',
    browserName: 'chromium',
    headless: true,
    viewport: { width: 1440, height: 1000 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: { executablePath, args: ['--no-sandbox', '--disable-dev-shm-usage'] }
  },
  webServer: {
    command: 'node server/index.js',
    url: 'http://127.0.0.1:3100/api/health',
    reuseExistingServer: false,
    timeout: 15000,
    env: { HOST: '127.0.0.1', PORT: '3100', SITE_URL: 'http://127.0.0.1:3100', DATABASE_PATH: join(databaseFolder, 'cafe.sqlite'), RATE_LIMIT_MAX: '1000' }
  }
});
