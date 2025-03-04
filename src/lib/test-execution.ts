import { spawnSync } from "child_process";
import { writeFile, mkdir, unlink, rm } from "fs/promises";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { validateCode } from "./code-validation";

const { existsSync } = fs;
const { join, normalize, sep, posix } = path;

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
 * Convert a file path to a URL path (with forward slashes)
 */
export function toUrlPath(filePath: string): string {
  // Always use forward slashes for URLs, even on Windows
  return filePath.split(sep).join(posix.sep);
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
  const publicDir = normalize(join(process.cwd(), "public"));
  const testResultsDir = normalize(join(publicDir, "test-results", testId));
  const reportDir = normalize(join(testResultsDir, "report"));
  const testsDir = normalize(join(publicDir, "tests"));
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
    testPath = normalize(join(testsDir, `test-${testId}.spec.js`));

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
      const playwrightReportDir = normalize(
        join(process.cwd(), "playwright-report")
      );
      if (existsSync(playwrightReportDir)) {
        await rm(playwrightReportDir, { recursive: true, force: true });
      }

      // Check if test-results directory exists in root and remove it
      const rootTestResultsDir = normalize(join(process.cwd(), "test-results"));
      if (existsSync(rootTestResultsDir)) {
        await rm(rootTestResultsDir, { recursive: true, force: true });
      }

      // Determine the command to run based on the OS
      const isWindows = process.platform === "win32";

      // For Windows, we need to use different command execution
      const command = isWindows ? "npx.cmd" : "npx";
      const args = [
        "playwright",
        "test",
        testPath,
        "--config=playwright.config.mjs",
      ];

      // Set environment variables for the process
      const env = {
        ...process.env,
        PLAYWRIGHT_HTML_REPORT: reportDir,
        PLAYWRIGHT_OUTPUT_DIR: testResultsDir,
        PLAYWRIGHT_OPEN_REPORT: "never",
        // Disable SSL certificate validation for Node.js API calls
        NODE_TLS_REJECT_UNAUTHORIZED: "0",
        // Additional environment variables for corporate environments
        HTTPS_PROXY: process.env.HTTPS_PROXY || process.env.https_proxy || "",
        HTTP_PROXY: process.env.HTTP_PROXY || process.env.http_proxy || "",
        NO_PROXY: process.env.NO_PROXY || process.env.no_proxy || "",
      };

      // Use spawnSync for cross-platform compatibility
      const spawnResult = spawnSync(command, args, {
        env,
        encoding: "utf8",
        cwd: process.cwd(),
        timeout: 60000, // Increase timeout to 60 seconds for corporate networks
        shell: isWindows, // Use shell on Windows to handle command execution properly
      });

      const status = spawnResult.status ?? 1; // Default to error if status is null
      const stdout = spawnResult.stdout || "";
      const stderrOutput = spawnResult.stderr || "";

      console.log(`Test execution completed with status: ${status}`);

      // Capture stdout and stderr regardless of test success/failure
      result = {
        stdout: stdout,
        stderr: stderrOutput,
      };

      // Determine success based on exit code
      success = status === 0;

      // Check if the HTML report was generated
      const htmlReportPath = normalize(join(reportDir, "index.html"));
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
            ${
              result.stderr?.includes("SSL") ||
              result.stderr?.includes("certificate")
                ? `<div style="background-color: #ffe6e6; padding: 10px; margin-top: 20px; border: 1px solid #ff9999;">
              <h2>SSL Certificate Error Detected</h2>
              <p>This appears to be an SSL certificate validation error, which is common in corporate environments with firewalls or SSL inspection.</p>
              <p>The application has been configured to bypass SSL validation, but your environment may require additional configuration.</p>
            </div>`
                : ""
            }
          </body>
        </html>`;

        await writeFile(htmlReportPath, minimalHtml);
      } else {
        console.log("HTML report was successfully generated");
      }

      // Build the report URL to return to the client - always use forward slashes for URLs
      const reportUrl = toUrlPath(
        `/api/test-results/${testId}/report/index.html`
      );
      console.log(`Report URL: ${reportUrl}`);

      // Cleanup temporary test file
      try {
        await unlink(testPath);
        console.log(`Cleaned up test file: ${testPath}`);

        // Check for and remove any root playwright directories
        const playwrightDirs = [
          normalize(join(process.cwd(), "playwright-report")),
          normalize(join(process.cwd(), "test-results")),
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

        const htmlReportPath = normalize(join(reportDir, "index.html"));
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
          normalize(join(process.cwd(), "playwright-report")),
          normalize(join(process.cwd(), "test-results")),
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
        reportUrl: toUrlPath(`/api/test-results/${testId}/report/index.html`),
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

      const htmlReportPath = normalize(join(reportDir, "index.html"));
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
        normalize(join(process.cwd(), "playwright-report")),
        normalize(join(process.cwd(), "test-results")),
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
      reportUrl: toUrlPath(`/api/test-results/${testId}/report/index.html`),
      testId,
      stdout: "",
      stderr: errorMessage,
    };
  }
}
