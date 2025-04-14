// @ts-check
import { defineConfig } from "@playwright/test";

export default defineConfig({
  // Use environment variable for test directory if provided, otherwise use default
  testDir: process.env.PLAYWRIGHT_TEST_DIR || "./public/tests",
  // We'll override these with CLI arguments for each test run
  reporter: [
    [
      "html",
      {
        outputFolder:
          process.env.PLAYWRIGHT_REPORT_DIR || "./public/test-results/report", // Use environment variable for report directory
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
    // Configure trace to be stored in the HTML report directly
    trace: {
      mode: "on", // Keep trace mode on for HTML report
      snapshots: true,
      screenshots: true,
      sources: true,
      attachments: true, // Include attachments in the report
    },
    screenshot: "on", 
    video: "on", 
    ignoreHTTPSErrors: true,
    contextOptions: {
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
    //         name: "webkit",
    //         use: { browserName: "webkit" },
    //     },
  ],
});
