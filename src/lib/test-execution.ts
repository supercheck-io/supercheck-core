import { spawnSync } from "child_process";
import {
  writeFile,
  mkdir,
  readFile,
  readdir,
  unlink,
  rm,
  stat,
} from "fs/promises";
import fs from "fs";
import { join, relative, dirname } from "path";
import { v4 as uuidv4 } from "uuid";
import { validateCode } from "./code-validation";

const { existsSync } = fs;

/**
 * Get content type based on file extension
 */
export function getContentType(path: string) {
  if (path.endsWith(".html")) return "text/html";
  if (path.endsWith(".css")) return "text/css";
  if (path.endsWith(".js")) return "application/javascript";
  if (path.endsWith(".json")) return "application/json";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".txt")) return "text/plain";
  if (path.endsWith(".woff2")) return "font/woff2";
  if (path.endsWith(".woff")) return "font/woff";
  if (path.endsWith(".webm")) return "video/webm";
  if (path.endsWith(".zip")) return "application/zip";
  return "application/octet-stream";
}

/**
 * Execute a Playwright test script and generate HTML report
 */
export async function executeTest(code: string): Promise<{
  success: boolean;
  error: string | null;
  reportUrl: string | null;
  testId: string;
  stdout: string;
  stderr: string;
}> {
  // Generate a unique ID for this test run
  const testId = uuidv4();
  const publicDir = join(process.cwd(), "public");
  const testResultsDir = join(publicDir, "test-results", testId);
  const reportDir = join(testResultsDir, "report");
  const testsDir = join(publicDir, "tests");
  let testPath = "";

  try {
    // Validate the code
    const validationResult = validateCode(code);
    if (!validationResult.valid) {
      return {
        success: false,
        error: validationResult.error,
        reportUrl: null,
        testId,
        stdout: "",
        stderr: validationResult.error,
      };
    }

    // Create necessary directories
    await mkdir(testResultsDir, { recursive: true });
    await mkdir(reportDir, { recursive: true });
    await mkdir(testsDir, { recursive: true });

    // Optionally remove screenshot steps
    code = code.replace(
      /\s*await\s+page\.screenshot\(\s*{\s*path\s*:\s*['"].*?['"]\s*}\s*\);?/g,
      ""
    );

    // Create a unique test file
    testPath = join(testsDir, `test-${testId}.spec.js`);

    // Wrap code in test if needed
    const testContent = code.includes("import { test, expect }")
      ? code
      : `
import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  ${code}
});
`;
    await writeFile(testPath, testContent);

    // Execute the test
    let success = false;
    let result = { stdout: "", stderr: "" };

    try {
      console.log(`Running test with ID: ${testId}`);
      console.log(`Test path: ${testPath}`);
      console.log(`Report directory: ${reportDir}`);

      // Check if playwright-report directory exists in root and remove it
      const playwrightReportDir = join(process.cwd(), "playwright-report");
      if (existsSync(playwrightReportDir)) {
        await rm(playwrightReportDir, { recursive: true, force: true });
      }

      // Check if test-results directory exists in root and remove it
      const rootTestResultsDir = join(process.cwd(), "test-results");
      if (existsSync(rootTestResultsDir)) {
        await rm(rootTestResultsDir, { recursive: true, force: true });
      }

      const {
        status,
        stdout,
        stderr: stderrOutput,
      } = spawnSync(
        "npx",
        ["playwright", "test", testPath, "--config=playwright.config.mjs"],
        {
          env: {
            ...process.env,
            PLAYWRIGHT_HTML_REPORT: reportDir,
            PLAYWRIGHT_OUTPUT_DIR: testResultsDir, // Set output dir to the test ID folder
            PLAYWRIGHT_OPEN_REPORT: "never", // Prevent auto-opening the report
          },
          encoding: "utf8",
          cwd: process.cwd(),
          timeout: 30000, // 30 second timeout
        }
      );

      console.log(`Test execution completed with status: ${status}`);

      // Capture stdout and stderr regardless of test success/failure
      result = {
        stdout: stdout || "",
        stderr: stderrOutput || "",
      };

      // Determine success based on exit code
      success = status === 0;

      // Check if the HTML report was generated
      const htmlReportPath = join(reportDir, "index.html");
      console.log(`Checking for HTML report at: ${htmlReportPath}`);

      // If the HTML report still doesn't exist, create a minimal one
      if (!existsSync(htmlReportPath)) {
        console.log("HTML report not found, creating a minimal one");

        // Create the report directory if it doesn't exist
        if (!existsSync(reportDir)) {
          await mkdir(reportDir, { recursive: true });
        }

        // Create a minimal HTML file so we have something to display
        const minimalHtml = `
        <html>
          <head><title>Test Results</title></head>
          <body>
            <h1>Test Failed</h1>
            <p>The test failed to generate a proper report.</p>
            <pre>${result.stderr || "No error details available"}</pre>
          </body>
        </html>`;

        await writeFile(htmlReportPath, minimalHtml);
      } else {
        console.log("HTML report was successfully generated");
      }

      // Build the report URL to return to the client
      const reportUrl = `/api/test-results/${testId}/report/index.html`;
      console.log(`Report URL: ${reportUrl}`);

      // Cleanup temporary test file
      try {
        await unlink(testPath);
        console.log(`Cleaned up test file: ${testPath}`);

        // Check for and remove any root playwright directories
        const playwrightDirs = [
          join(process.cwd(), "playwright-report"),
          join(process.cwd(), "test-results"),
        ];

        for (const dir of playwrightDirs) {
          if (existsSync(dir)) {
            await rm(dir, { recursive: true, force: true });
            console.log(`Removed directory: ${dir}`);
          }
        }
      } catch (cleanupError) {
        console.error("Failed to clean up files/directories:", cleanupError);
      }

      // Always return the report URL regardless of test success/failure
      return {
        success,
        error: success ? null : result.stderr || "Test failed",
        reportUrl,
        testId,
        stdout: result.stdout,
        stderr: result.stderr,
      };
    } catch (error) {
      console.error("Error executing test:", error);

      let errorMessage = "Unknown error";
      if (error instanceof Error) {
        errorMessage = error.message;
      }

      // Create a minimal HTML report for the error case
      try {
        // Create necessary directories if they don't exist
        if (!existsSync(testResultsDir)) {
          await mkdir(testResultsDir, { recursive: true });
        }
        if (!existsSync(reportDir)) {
          await mkdir(reportDir, { recursive: true });
        }

        const htmlReportPath = join(reportDir, "index.html");
        const minimalHtml = `
        <html>
          <head><title>Test Error</title></head>
          <body>
            <h1>Test Error</h1>
            <p>An error occurred while trying to run the test:</p>
            <pre>${errorMessage}</pre>
          </body>
        </html>`;

        await writeFile(htmlReportPath, minimalHtml);
      } catch (reportError) {
        console.error("Failed to create error report:", reportError);
      }

      // Cleanup temporary test file and any root playwright directories
      try {
        if (existsSync(testPath)) {
          await unlink(testPath);
        }

        const playwrightDirs = [
          join(process.cwd(), "playwright-report"),
          join(process.cwd(), "test-results"),
        ];

        for (const dir of playwrightDirs) {
          if (existsSync(dir)) {
            await rm(dir, { recursive: true, force: true });
          }
        }
      } catch (cleanupError) {
        console.error("Failed to clean up files/directories:", cleanupError);
      }

      // Always return the report URL regardless of test success/failure
      return {
        success: false,
        error: errorMessage,
        reportUrl: `/api/test-results/${testId}/report/index.html`,
        testId,
        stdout: result.stdout,
        stderr: result.stderr,
      };
    }
  } catch (error) {
    console.error("Error setting up test:", error);

    let errorMessage = "Unknown error";
    if (error instanceof Error) {
      errorMessage = error.message;
    }

    // Create a minimal HTML report for the error case
    try {
      // Create necessary directories if they don't exist
      if (!existsSync(testResultsDir)) {
        await mkdir(testResultsDir, { recursive: true });
      }
      if (!existsSync(reportDir)) {
        await mkdir(reportDir, { recursive: true });
      }

      const htmlReportPath = join(reportDir, "index.html");
      const minimalHtml = `
      <html>
        <head><title>Test Error</title></head>
        <body>
          <h1>Test Error</h1>
          <p>An error occurred while trying to run the test:</p>
          <pre>${errorMessage}</pre>
        </body>
      </html>`;

      await writeFile(htmlReportPath, minimalHtml);
    } catch (reportError) {
      console.error("Failed to create error report:", reportError);
    }

    // Cleanup temporary test file and any root playwright directories
    try {
      if (testPath && existsSync(testPath)) {
        await unlink(testPath);
      }

      const playwrightDirs = [
        join(process.cwd(), "playwright-report"),
        join(process.cwd(), "test-results"),
      ];

      for (const dir of playwrightDirs) {
        if (existsSync(dir)) {
          await rm(dir, { recursive: true, force: true });
        }
      }
    } catch (cleanupError) {
      console.error("Failed to clean up files/directories:", cleanupError);
    }

    // Always return the report URL regardless of test success/failure
    return {
      success: false,
      error: errorMessage,
      reportUrl: `/api/test-results/${testId}/report/index.html`,
      testId,
      stdout: "",
      stderr: errorMessage,
    };
  }
}
