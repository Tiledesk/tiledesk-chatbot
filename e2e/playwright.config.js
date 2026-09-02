'use strict';
const { defineConfig, devices } = require('@playwright/test');
const config = require('./config');

module.exports = defineConfig({
  testDir: './tests',
  // A slow branch (an LLM block on staging) can hold a single test for a while.
  timeout: 5 * 60 * 1000,
  expect: { timeout: config.REPLY_TIMEOUT },
  // One worker: every test drives the same bot, and a conversation is stateful.
  // Two browsers talking to it at once interleave replies for no benefit.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: '.report' }]],
  outputDir: '.results',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: config.BASE_URL,
    headless: !config.HEADFUL,
    viewport: { width: 1680, height: 1000 },
    actionTimeout: 30000,
    navigationTimeout: 60000,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure'
  }
});
