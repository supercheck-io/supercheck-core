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
  ],
  // Remove the separate output directory - everything will be in the test ID folder
  // outputDir: "./public/test-results/output",
  use: {
    headless: true,
    trace: "on",
    video: "on",
    // Ignore HTTPS errors to allow tests to run in corporate environments with SSL inspection
    ignoreHTTPSErrors: true,
    // Add additional context options for corporate environments
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
  timeout: 60000, // 60 seconds per test
  // Configure global timeout
  globalTimeout: 600000, // 10 minutes for the entire test run
  // Configure retry strategy
  retries: 1, // Retry failed tests once
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
    {
      name: "firefox",
      use: {
        browserName: "firefox",
        // Additional browser-specific options for corporate environments
        launchOptions: {
          firefoxUserPrefs: {
            "network.proxy.type": 0,
            "security.cert_pinning.enforcement_level": 0,
            "security.enterprise_roots.enabled": true,
            "security.ssl.enable_ocsp_stapling": false,
          },
        },
      },
    },
    {
      name: "webkit",
      use: { browserName: "webkit" },
    },
  ],
});
