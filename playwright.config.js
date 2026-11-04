import { defineConfig } from '@playwright/test';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const databaseFolder = mkdtempSync(join(tmpdir(), 'bitesbro-browser-'));
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
// Only the isolated loopback test server bypasses an inherited outbound proxy.
for(const name of ['NO_PROXY','no_proxy'])process.env[name]=[process.env[name],'127.0.0.1','localhost'].filter(Boolean).join(',');
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
  webServer: [{
    command: 'node server/index.js',
    url: 'http://127.0.0.1:3100/api/health',
    reuseExistingServer: false,
    timeout: 15000,
    env: { HOST: '127.0.0.1', PORT: '3100', SITE_URL: 'http://127.0.0.1:3100', DATABASE_PATH: join(databaseFolder, 'cafe.sqlite'), RATE_LIMIT_MAX: '1000', APP_DEMO_MODE: 'true' }
  },{
    command:'node server/review-demo.js',
    url:'http://127.0.0.1:3210/api/health',
    timeout:30000,
    reuseExistingServer:false,
    env:{REVIEW_PORT:'3210',REVIEW_HOST:'127.0.0.1'}
  },{
    command:'npm run build:review && node scripts/serve-review.js',
    url:'http://127.0.0.1:3212/Cafe_Website/review/review.html',
    timeout:30000,
    reuseExistingServer:false,
    env:{STATIC_REVIEW_PORT:'3212'}
  }]
});
