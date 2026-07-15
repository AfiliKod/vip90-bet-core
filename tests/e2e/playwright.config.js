import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve('../../.env.test') });
dotenv.config({ path: path.resolve('../../.env') });

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
    },
  },

  globalSetup: require.resolve('./global-setup.js'),
  globalTeardown: require.resolve('./global-teardown.js'),

  metadata: {
    testEnv: process.env.NODE_ENV || 'development',
    baseURL: BASE_URL,
    apiURL: API_URL,
  },
});