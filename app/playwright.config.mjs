// @ts-check
import { defineConfig, devices } from "@playwright/test";
import { randomUUID } from 'crypto';

// Generate a unique ID for this test run
const runId = randomUUID();

// Read environment variables to determine reporter output paths
const outputDir = process.env.PLAYWRIGHT_OUTPUT_DIR || './playwright-results';
const htmlReportDir = process.env.PLAYWRIGHT_HTML_REPORT || `${outputDir}/html-report`;
const junitReportFile = process.env.PLAYWRIGHT_JUNIT_REPORT || `${outputDir}/junit-report.xml`;

console.log(`[Playwright Config] HTML report directory: ${htmlReportDir}`);
// console.log(`[Playwright Config] JUnit report file: ${junitReportFile}`);

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  // Directory where test files are located (relative to config file)
  // This might not be strictly necessary if tests are passed as CLI arguments,
  // but good to have a default.
  testDir: './temp-tests', // Assuming tests might be temporarily written here
  
  // Maximum time one test can run for.
  timeout: 60 * 1000, // 60 seconds (adjust as needed)
  
  expect: {
    // Maximum time expect() should wait for the condition to be met.
    timeout: 5000
  },
  
  // Run tests in files in parallel 
  fullyParallel: true,
  
  // Fail the build on CI if you accidentally left test.only in the source code.
  forbidOnly: !!process.env.CI,
  
  // Retry on CI only 
  retries: process.env.CI ? 2 : 0,
  
  // Opt out of parallel tests on CI.
  workers: process.env.CI ? 1 : undefined,
  
  // Reporter to use. See https://playwright.dev/docs/test-reporters 
  reporter: [
    ['list'], // Console reporter
    ['html', { outputFolder: htmlReportDir, open: 'never' }],
    // Optional: JUnit reporter for CI systems
    // ['junit', { outputFile: junitReportFile }] 
  ],
  
  // Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. 
  use: {
    // Base URL to use in actions like `await page.goto('/')`. 
    baseURL: process.env.BASE_URL || 'http://localhost:3000', // Example base URL

    // Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer 
    trace: 'on-first-retry',
    
    // Capture screenshot on failure
    screenshot: 'only-on-failure',
    
    // Record video on failure
    video: 'retain-on-failure',
  },

  // Configure projects for major browsers 
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
  ],

  // Folder for test artifacts such as screenshots, videos, traces, etc. 
  outputDir: outputDir, 
});
