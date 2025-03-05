// @ts-check
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./public/tests",
  // We'll override these with CLI arguments for each test run
  reporter: [
    [
      "html",
      {
        outputFolder: "./public/test-results/report",
        open: "never", // Prevent auto-opening the report
      },
    ],
    // [
    //   "junit",
    //   {
    //     outputFile: "test-results/junit-report.xml",
    //   },
    // ],
  ],
  // Remove the separate output directory - everything will be in the test ID folder
  // outputDir: "./public/test-results/output",
  use: {
    headless: true,
    // Optimize trace collection to only collect on first retry to improve performance
    trace: {
      mode: "on", // Changed from "on" to only trace on retry
      snapshots: true,
      screenshots: true,
      sources: true,
    },
    // Screenshot configuration - only on failure to improve performance
    screenshot: "on", // Changed from "on" to only capture on failure
    // Video configuration - only retain on failure to improve performance
    video: "on", // Changed from "on" to only keep on failure
    // Ignore HTTPS errors to allow tests to run in corporate environments with SSL inspection
    ignoreHTTPSErrors: true,
    // Add additional context options for corporate environments
    contextOptions: {
      // Needed for bypassing SSL errors in corporate environments
      ignoreHTTPSErrors: true,
    },
    // Add request options to handle API requests
    extraHTTPHeaders: {
      Accept: "*/*",
    },
    // Increase timeouts for corporate networks
    navigationTimeout: 60000,
    actionTimeout: 30000,
  },
  // Configure timeouts at the test level
  timeout: 120 * 1000, // 120 seconds per test
  expect: {
    /**
     * Maximum time expect() should wait for the condition to be met.
     * For example in `await expect(locator).toHaveText();`
     */
    timeout: 5000,
  },
  // Configure global timeout
  globalTimeout: 600000, // 10 minutes for the entire test run
  // Configure retry strategy
  retries: 1, // Retry failed tests once
  workers: 6,
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        // Additional browser-specific options for corporate environments
        launchOptions: {
          args: [
            "--disable-web-security",
            "--ignore-certificate-errors",
            "--allow-insecure-localhost",
            "--disable-features=IsolateOrigins,site-per-process",
          ],
        },
      },
    },
    // {
    //   name: "firefox",
    //   use: {
    //     browserName: "firefox",
    //     // Additional browser-specific options for corporate environments
    //     launchOptions: {
    //       firefoxUserPrefs: {
    //         "network.proxy.type": 0,
    //         "security.cert_pinning.enforcement_level": 0,
    //         "security.enterprise_roots.enabled": true,
    //         "security.ssl.enable_ocsp_stapling": false,
    //       },
    //     },
    //   },
    // },
    // {
    //   name: "webkit",
    //   use: { browserName: "webkit" },
    // },
  ],
});
