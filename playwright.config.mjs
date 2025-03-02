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
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
    {
      name: "firefox",
      use: { browserName: "firefox" },
    },
    {
      name: "webkit",
      use: { browserName: "webkit" },
    },
  ],
});
