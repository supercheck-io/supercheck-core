const { defineConfig, devices } = require("@playwright/test");
const path = require('path');

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// require('dotenv').config();

// Construct the path relative to the current file's directory
const serviceRoot = path.resolve(__dirname); // __dirname is available in CommonJS

// Use environment variables or default values - no local test directory since tests are dynamically created
const testDir = process.env.PLAYWRIGHT_TEST_DIR || '/tmp/playwright-tests';
// Default output dir - REMOVED reliance on env var
// const artifactOutputDir = process.env.PLAYWRIGHT_OUTPUT_DIR || path.join(serviceRoot, 'playwright-artifacts'); 
const relativeOutputDir = 'report'; // Define relative path

console.log(`Playwright Config Loaded`);
console.log(`Service Root: ${serviceRoot}`);
console.log(`Test Directory: ${testDir}`);
// console.log(`Output Directory (Unified): ${artifactOutputDir}`); // REMOVED
console.log(`Using relative output directory: ${relativeOutputDir}`);

/**
 * @see https://playwright.dev/docs/test-configuration
 */
module.exports = defineConfig({
  testDir: testDir,
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 1 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 3 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    // HTML reporter will be configured via CLI parameters
    ['list'] // Optional: console reporter
  ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    // baseURL: 'http://127.0.0.1:3000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on',
    screenshot: 'on',
    video: 'on',
  },
  
  /* Directory for test artifacts such as screenshots, videos, traces, etc. */
  outputDir: relativeOutputDir, // Use the relative path

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },

    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* Run your local dev server before starting the tests */
  // webServer: {
  //   command: 'npm run start',
  //   url: 'http://127.0.0.1:3000',
  //   reuseExistingServer: !process.env.CI,
  // },
}); 