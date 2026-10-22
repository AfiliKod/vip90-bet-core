import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'node:url';

// Bu paket "type": "module" (b01e984d, 2026-10-11) — config ESM'de `require`
// yok, `path.resolve` ise process.cwd()'ye göre çözülüyor ve `npm run test:e2e`
// repo kökünden koşulduğunda ../../ .env.test reponun DIŞINA düşüyordu
// (dotenv "injected env (0)" logluyordu). Yolları config dosyasına bağladık.
const HERE = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(HERE, '../../.env.test') });
dotenv.config({ path: path.resolve(HERE, '../../.env') });

const isCI = !!process.env.CI;
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:5173';
const API_URL = process.env.E2E_API_URL || 'http://localhost:3000/api';

export default defineConfig({
  testDir: './specs',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : 2,
  timeout: 60000,
  expect: { timeout: 10000 },

  reporter: [
    ['html', { outputFolder: '../playwright-report', open: 'never' }],
    ['list'],
    ['json', { outputFile: '../test-results/results.json' }],
  ],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    headless: isCI,
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: { 'x-test-mode': 'true' },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: !isCI,
    timeout: 120000,
    env: {
      NODE_ENV: 'test',
      VITE_API_URL: API_URL,
      MONGODB_URI: 'mongodb://localhost:27017/betzone_test',
    },
  },

  globalSetup: path.resolve(HERE, 'global-setup.js'),
  globalTeardown: path.resolve(HERE, 'global-teardown.js'),

  metadata: {
    testEnv: process.env.NODE_ENV || 'development',
    baseURL: BASE_URL,
    apiURL: API_URL,
  },
});