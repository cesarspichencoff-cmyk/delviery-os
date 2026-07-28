'use strict';

const os = require('node:os');
const path = require('node:path');
const { defineConfig } = require('@playwright/test');

const chrome = process.env.PLAYWRIGHT_CHROME_PATH;
if (!chrome) throw new Error('PLAYWRIGHT_CHROME_PATH is required for the development-only browser suite.');

module.exports = defineConfig({
  testDir: __dirname,
  testMatch: 'homologation-panel.spec.js',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  outputDir: path.join(os.tmpdir(), 'deliveryos-homologation-playwright-artifacts'),
  reporter: [
    ['line'],
    ['json', { outputFile: process.env.PLAYWRIGHT_JSON_REPORT || path.join(os.tmpdir(), 'deliveryos-homologation-playwright.json') }]
  ],
  use: {
    browserName: 'chromium',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'off',
    video: 'off',
    launchOptions: { executablePath: chrome }
  }
});
