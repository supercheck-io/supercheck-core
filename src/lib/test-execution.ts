// Import child_process as a whole module to avoid Next.js dynamic import issues
import * as childProcess from "child_process";
import { writeFile, mkdir, unlink, rm, readFile } from "fs/promises";
import fs from "fs";
import path from "path";
import { validateCode } from "./code-validation";
import async from "async";

// Suppress the NODE_TLS_REJECT_UNAUTHORIZED warning
// process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const { spawn } = childProcess;
const { join, normalize, sep, posix, dirname } = path;

// Configure the maximum number of concurrent tests
const MAX_CONCURRENT_TESTS = 2;

// Maximum time to wait for a test to complete
const TEST_EXECUTION_TIMEOUT_MS = 120000; // 2 minutes

// How often to recover trace files
const TRACE_RECOVERY_INTERVAL_MS = 30000; // 30 seconds

// Track the last cleanup time to avoid too frequent cleanups
let lastCleanupTime: number | null = null;
const CLEANUP_INTERVAL = 15 * 60 * 1000; // 15 minutes - less frequent cleanups

// Define the TestResult interface
interface TestResult {
  success: boolean;
  error: string | null;
  reportUrl: string | null;
  testId: string;
  stdout: string;
  stderr: string;
}

// Define an interface for test status updates
export interface TestStatusUpdate {
  testId: string;
  status: "pending" | "running" | "completed";
  success?: boolean;
  error?: string | null;
  reportUrl?: string | null;
}

// A map to store the status of each test
const testStatusMap = new Map<string, TestStatusUpdate>();

// track active test IDs to prevent premature cleanup
const activeTestIds = new Set<string>();

// Keep a record of recent test IDs to avoid cleaning them up too soon
// Store with timestamp to know when they were created
const recentTestIds = new Map<string, number>();

// How long to consider a test "recent" (30 minutes)
const RECENT_TEST_WINDOW_MS = 30 * 60 * 1000;

// Function to get the status of a test
export function getTestStatus(testId: string): TestStatusUpdate | null {
  return testStatusMap.get(testId) || null;
}

// Create a queue for test execution with limited concurrency
const testQueue = async.queue(
  async (
    task: {
      testId: string;
      testPath: string;
      code: string;
      resolve: (value: TestResult) => void;
      reject: (reason: Error | TestResult) => void;
    },
    callback
  ) => {
    try {
      // Update the test status to running
      testStatusMap.set(task.testId, {
        testId: task.testId,
        status: "running",
      });

      const result = await executeTestInChildProcess(
        task.testId,
        task.testPath,
        task.code
      );

      // Update the test status to completed
      testStatusMap.set(task.testId, {
        testId: task.testId,
        status: "completed",
        success: result.success,
        error: result.error,
        reportUrl: result.reportUrl,
      });

      task.resolve(result);
    } catch (error) {
      // Update the test status to completed with error
      if (error instanceof Error) {
        testStatusMap.set(task.testId, {
          testId: task.testId,
          status: "completed",
          success: false,
          error: error.message,
        });
        task.reject(error);
      } else if (typeof error === "object" && error !== null) {
        testStatusMap.set(task.testId, {
          testId: task.testId,
          status: "completed",
          success: false,
          error: (error as TestResult).error,
          reportUrl: (error as TestResult).reportUrl,
        });
        task.reject(error as Error | TestResult);
      } else {
        // Handle primitive error types
        const errorMessage = String(error);
        testStatusMap.set(task.testId, {
          testId: task.testId,
          status: "completed",
          success: false,
          error: errorMessage,
        });
        task.reject(new Error(errorMessage));
      }
    } finally {
      callback();
    }
  },
  MAX_CONCURRENT_TESTS
);

// Add event handler for when the queue is drained
testQueue.drain(() => {
  console.log("All tests have been processed.");
});

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
 * Execute a test in a child process
 */
async function executeTestInChildProcess(
  testId: string,
  testPath: string,
  code: string = ""
): Promise<TestResult> {
  return new Promise(async (resolve, reject) => {
    try {
      console.log(`Preparing to execute test ID: ${testId}`);

      // Set up paths
      const publicDir = normalize(join(process.cwd(), "public"));
      const testResultsDir = normalize(join(publicDir, "test-results", testId));
      const reportDir = normalize(join(testResultsDir, "report"));
      const htmlReportPath = normalize(join(reportDir, "index.html"));

      // Create artifact directories directly in the test results directory
      const tracesDir = normalize(join(testResultsDir, "traces"));
      const screenshotsDir = normalize(join(testResultsDir, "screenshots"));
      const videosDir = normalize(join(testResultsDir, "videos"));
      const resultsDir = normalize(join(testResultsDir, "results"));

      try {
        // Use a single mkdir call with recursive option to create all directories at once
        await mkdir(reportDir, { recursive: true });
        await mkdir(tracesDir, { recursive: true });
        await mkdir(screenshotsDir, { recursive: true });
        await mkdir(videosDir, { recursive: true });
        await mkdir(resultsDir, { recursive: true });
      } catch (err) {
        console.warn(
          `Warning: Failed to create directories for test ${testId}:`,
          err
        );
        // Continue execution, as Playwright will try to create them again
      }

      // Create a lightweight loading report while the test is running
      try {
        const loadingHtml = `<!DOCTYPE html>
<html>
  <head>
    <title>Test Running - ${testId}</title>
    <style>
      body { font-family: system-ui; background-color: #f8f8f8; color: #333; margin: 0; padding: 20px; }
      .container { max-width: 800px; margin: 0 auto; background-color: white; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); padding: 20px; }
      h1 { color: #2563eb; margin-top: 0; }
      .loading { display: flex; align-items: center; margin: 20px 0; }
      .spinner { border: 4px solid rgba(0, 0, 0, 0.1); width: 36px; height: 36px; border-radius: 50%; border-left-color: #2563eb; animation: spin 1s linear infinite; margin-right: 15px; }
      @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    </style>
    <script>setTimeout(function() { location.reload(); }, 5000);</script>
  </head>
  <body>
    <div class="container">
      <h1>Test Execution in Progress</h1>
      <div class="loading"><div class="spinner"></div><div>Running your tests...</div></div>
      <p>Test ID: <code>${testId}</code></p>
    </div>
  </body>
</html>`;

        await mkdir(dirname(htmlReportPath), { recursive: true });
        await writeFile(htmlReportPath, loadingHtml);

        // Update test status with the initial report URL
        testStatusMap.set(testId, {
          testId,
          status: "running",
          reportUrl: toUrlPath(`/api/test-results/${testId}/report/index.html`),
        });
      } catch (err) {
        console.error(`Error creating loading report for test ${testId}:`, err);
      }

      // Recovery function for trace ENOENT errors
      const attemptTraceFileRecovery = async () => {
        try {
          // Create an empty trace file to prevent ENOENT errors
          const commonTraceFiles = [
            join(tracesDir, `${testId}-recording1.network`),
            join(tracesDir, `${testId}.network`),
            join(tracesDir, `${testId}-recording1.zip`),
            join(tracesDir, `${testId}.zip`),
          ];

          // Create tracesDir with recursive option if it doesn't exist
          if (!fs.existsSync(tracesDir)) {
            await mkdir(tracesDir, { recursive: true });
          }

          // Create common trace files to avoid ENOENT errors - optimized to only check and create necessary files
          for (const filePattern of commonTraceFiles) {
            // Create specific files if they don't exist
            if (!fs.existsSync(filePattern)) {
              try {
                await writeFile(filePattern, "");
                console.log(
                  `Created empty trace file to avoid ENOENT: ${filePattern}`
                );
              } catch (err) {
                console.warn(
                  `Failed to create trace file: ${filePattern}`,
                  err
                );
              }
            }
          }

          // Check for root test-results directory - but only once
          const rootTestResults = normalize(
            join(process.cwd(), "test-results")
          );
          if (fs.existsSync(rootTestResults)) {
            // Create placeholder files in this directory
            const rootTracesDir = join(rootTestResults, "traces");
            if (!fs.existsSync(rootTracesDir)) {
              await mkdir(rootTracesDir, { recursive: true });
              await writeFile(join(rootTracesDir, "placeholder.network"), "");
              await writeFile(join(rootTracesDir, "placeholder.zip"), "");
            }
          }
        } catch (error) {
          console.error("Failed to create trace recovery files:", error);
        }
      };

      // Call trace recovery immediately and less frequently during the test to reduce overhead
      await attemptTraceFileRecovery().catch((err) =>
        console.warn("Initial trace recovery failed:", err)
      );
      const recoveryInterval = setInterval(
        attemptTraceFileRecovery,
        TRACE_RECOVERY_INTERVAL_MS
      ); // Reduced frequency from 5s to 30s

      // Determine the command to run based on the OS
      const isWindows = process.platform === "win32";
      const command = isWindows ? "npx.cmd" : "npx";
      const args = [
        "playwright",
        "test",
        testPath, // Ensure we're only running the specific test file
        "--config=playwright.config.mjs",
      ];

      console.log(`Running command: ${command} ${args.join(" ")}`);

      // Spawn the child process with improved options
      const childProcess = spawn(command, args, {
        env: {
          ...process.env,
          // Prevent the NODE_TLS_REJECT_UNAUTHORIZED warning in the child process
          // NODE_TLS_REJECT_UNAUTHORIZED: "0",
          // Pass the test ID to make it available in the test
          TEST_ID: testId,
          // Add artifacts directories to avoid conflicts between parallel tests
          PLAYWRIGHT_ARTIFACTS_DIR: testResultsDir,
          PLAYWRIGHT_HTML_REPORT: reportDir,
          PLAYWRIGHT_JUNIT_REPORT: normalize(
            join(testResultsDir, "junit-report.xml")
          ),
          // SSL certificate bypass related vars
          HTTPS_PROXY: process.env.HTTPS_PROXY || process.env.https_proxy || "",
          HTTP_PROXY: process.env.HTTP_PROXY || process.env.http_proxy || "",
          NO_PROXY: process.env.NO_PROXY || process.env.no_proxy || "",
        },
        shell: isWindows, // Only use shell on Windows
        windowsHide: true, // Hide the command prompt window on Windows
        cwd: process.cwd(),
        // Set stdio to pipe to capture output
        stdio: ["ignore", "pipe", "pipe"],
        // Detach for better process management
        detached: false, // Change to false to prevent detached processes on Windows
      });

      // Process variables
      let stdoutChunks: string[] = [];
      let stderrChunks: string[] = [];

      // Limit buffer size to avoid memory issues
      const MAX_CHUNKS = 500; // Store at most 500 chunks

      // Stream stdout from the child process
      childProcess.stdout.on("data", (data) => {
        const chunk = data.toString();
        stdoutChunks.push(chunk);
        // Limit number of chunks to avoid excessive memory usage
        if (stdoutChunks.length > MAX_CHUNKS) {
          stdoutChunks.shift(); // Remove oldest chunk
        }

        // Log with a clear prefix to identify the test
        console.log(`[Test ${testId}] ${chunk.trim()}`);
      });

      // Stream stderr from the child process
      childProcess.stderr.on("data", (data) => {
        const chunk = data.toString();
        stderrChunks.push(chunk);
        // Limit number of chunks to avoid excessive memory usage
        if (stderrChunks.length > MAX_CHUNKS) {
          stderrChunks.shift(); // Remove oldest chunk
        }

        // Log with a clear prefix to identify the test
        console.error(`[Test ${testId}] ${chunk.trim()}`);
      });

      // Start checking for the report file before the process completes
      const startTime = Date.now();

      // Generate a timeout for the process
      const timeout = setTimeout(() => {
        if (childProcess && !childProcess.killed) {
          childProcess.kill();
          const timeoutError = "Test execution timed out after 2 minutes";
          console.error(timeoutError);

          // When test times out, we should still ensure we have a report
          try {
            if (fs.existsSync(htmlReportPath)) {
              // Update the loading report with timeout information
              readFile(htmlReportPath, "utf8")
                .then((content) => {
                  if (content.includes("Test Execution in Progress")) {
                    // It's still a loading report, update it with timeout info
                    const timeoutHtml = `
                    <!DOCTYPE html>
                    <html>
                      <head>
                        <title>Test Timed Out</title>
                        <style>
                          body {
                            font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
                            background-color: #f8f8f8;
                            color: #333;
                            margin: 0;
                            padding: 20px;
                            line-height: 1.6;
                          }
                          .container {
                            max-width: 800px;
                            margin: 0 auto;
                            background-color: white;
                            border-radius: 8px;
                            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                            padding: 20px;
                          }
                          h1 {
                            color: #dc2626;
                            margin-top: 0;
                          }
                          .error-box {
                            background-color: #fef2f2;
                            border-left: 4px solid #dc2626;
                            padding: 15px;
                            margin: 20px 0;
                          }
                          pre {
                            background-color: #f1f5f9;
                            padding: 15px;
                            border-radius: 4px;
                            overflow-x: auto;
                          }
                        </style>
                      </head>
                      <body>
                        <div class="container">
                          <h1>Test Timed Out</h1>
                          <div class="error-box">
                            <h2>Error Details</h2>
                            <p>${timeoutError}</p>
                          </div>
                          <h2>Test Output</h2>
                          <pre>${stdoutChunks.join("")}</pre>
                          <h2>Test Errors</h2>
                          <pre>${stderrChunks.join("")}</pre>
                        </div>
                      </body>
                    </html>
                    `;
                    writeFile(htmlReportPath, timeoutHtml).catch((e) =>
                      console.error(`Error writing timeout report: ${e}`)
                    );
                  }
                })
                .catch((e) => console.error(`Error reading report file: ${e}`));
            } else {
              // Report doesn't exist, create one
              const timeoutHtml = `
              <!DOCTYPE html>
              <html>
                <head>
                  <title>Test Timed Out</title>
                  <style>
                    body {
                      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
                      background-color: #f8f8f8;
                      color: #333;
                      margin: 0;
                      padding: 20px;
                      line-height: 1.6;
                    }
                    .container {
                      max-width: 800px;
                      margin: 0 auto;
                      background-color: white;
                      border-radius: 8px;
                      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                      padding: 20px;
                    }
                    h1 {
                      color: #dc2626;
                      margin-top: 0;
                    }
                    .error-box {
                      background-color: #fef2f2;
                      border-left: 4px solid #dc2626;
                      padding: 15px;
                      margin: 20px 0;
                    }
                    pre {
                      background-color: #f1f5f9;
                      padding: 15px;
                      border-radius: 4px;
                      overflow-x: auto;
                    }
                  </style>
                </head>
                <body>
                  <div class="container">
                    <h1>Test Timed Out</h1>
                    <div class="error-box">
                      <h2>Error Details</h2>
                      <p>${timeoutError}</p>
                    </div>
                    <h2>Test Output</h2>
                    <pre>${stdoutChunks.join("")}</pre>
                    <h2>Test Errors</h2>
                    <pre>${stderrChunks.join("")}</pre>
                  </div>
                </body>
              </html>
              `;
              writeFile(htmlReportPath, timeoutHtml).catch((e) =>
                console.error(`Error writing timeout report: ${e}`)
              );
            }
          } catch (e) {
            console.error(`Error handling timeout report: ${e}`);
          }

          // Update the test status
          testStatusMap.set(testId, {
            testId,
            status: "completed",
            success: false,
            error: timeoutError,
            reportUrl: toUrlPath(
              `/api/test-results/${testId}/report/index.html`
            ),
          });

          reject({
            success: false,
            error: timeoutError,
            reportUrl: toUrlPath(
              `/api/test-results/${testId}/report/index.html`
            ),
            testId,
            stdout: stdoutChunks.join(""),
            stderr: stderrChunks.join(""),
          });
        }
      }, TEST_EXECUTION_TIMEOUT_MS); // 2 minutes timeout

      childProcess.on("exit", async (code, signal) => {
        clearTimeout(timeout);
        clearInterval(recoveryInterval); // Clear the recovery interval

        console.log(
          `Child process for test ${testId} exited with code: ${code}, signal: ${signal}`
        );

        const stdout = stdoutChunks.join("");
        const stderr = stderrChunks.join("");

        // Check if the test failed
        if (code !== 0) {
          let errorMessage = `Test failed with exit code ${code}${
            stderr ? ": " + stderr : ""
          }`;

          // Check for the specific ENOENT trace error and provide more details
          if (stderr.includes("ENOENT") && stderr.includes("traces")) {
            errorMessage = `Test failed due to trace file error. This is usually caused by permissions or directory issues. Error details: ${stderr}`;

            // Try to create the trace directory again as a recovery mechanism
            try {
              await mkdir(tracesDir, { recursive: true });
              console.log(
                `Recreated traces directory for test ${testId} after ENOENT error`
              );
            } catch (dirErr) {
              console.error(
                `Failed to recreate traces directory for test ${testId}:`,
                dirErr
              );
            }
          }

          console.error(`Test ${testId} failed: ${errorMessage}`);

          try {
            // Check if the report exists, and if not, generate a minimal error report
            if (!fs.existsSync(htmlReportPath)) {
              console.log(
                `Creating minimal HTML report for failed test ${testId}`
              );

              const minimalHtml = `
              <!DOCTYPE html>
              <html>
                <head>
                  <title>Test Error</title>
                  <style>
                    body {
                      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
                      background-color: #f8f8f8;
                      color: #333;
                      margin: 0;
                      padding: 20px;
                      line-height: 1.6;
                    }
                    .container {
                      max-width: 800px;
                      margin: 0 auto;
                      background-color: white;
                      border-radius: 8px;
                      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                      padding: 20px;
                    }
                    h1 {
                      color: #dc2626;
                      margin-top: 0;
                    }
                    .error-box {
                      background-color: #fef2f2;
                      border-left: 4px solid #dc2626;
                      padding: 15px;
                      margin: 20px 0;
                    }
                    pre {
                      background-color: #f1f5f9;
                      padding: 15px;
                      border-radius: 4px;
                      overflow-x: auto;
                    }
                  </style>
                </head>
                <body>
                  <div class="container">
                    <h1>Test Error</h1>
                    <div class="error-box">
                      <h2>Error Details</h2>
                      <p>${errorMessage}</p>
                    </div>
                    <h2>Test Output</h2>
                    <pre>${stdout}</pre>
                    <h2>Test Errors</h2>
                    <pre>${stderr}</pre>
                  </div>
                </body>
              </html>
              `;

              await writeFile(htmlReportPath, minimalHtml);
            } else {
              // If the report exists, check if it's still the loading report
              const reportContent = await readFile(htmlReportPath, "utf8");
              if (reportContent.includes("Test Execution in Progress")) {
                // Update it with the error information
                const errorHtml = `
                <!DOCTYPE html>
                <html>
                  <head>
                    <title>Test Failed</title>
                    <style>
                      body {
                        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
                        background-color: #f8f8f8;
                        color: #333;
                        margin: 0;
                        padding: 20px;
                        line-height: 1.6;
                      }
                      .container {
                        max-width: 800px;
                        margin: 0 auto;
                        background-color: white;
                        border-radius: 8px;
                        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                        padding: 20px;
                      }
                      h1 {
                        color: #dc2626;
                        margin-top: 0;
                      }
                      .error-box {
                        background-color: #fef2f2;
                        border-left: 4px solid #dc2626;
                        padding: 15px;
                        margin: 20px 0;
                      }
                      pre {
                        background-color: #f1f5f9;
                        padding: 15px;
                        border-radius: 4px;
                        overflow-x: auto;
                      }
                    </style>
                  </head>
                  <body>
                    <div class="container">
                      <h1>Test Failed</h1>
                      <div class="error-box">
                        <h2>Error Details</h2>
                        <p>${errorMessage}</p>
                      </div>
                      <h2>Test Output</h2>
                      <pre>${stdout}</pre>
                      <h2>Test Errors</h2>
                      <pre>${stderr}</pre>
                    </div>
                  </body>
                </html>
                `;

                await writeFile(htmlReportPath, errorHtml);
              }
            }

            // Update the test status
            testStatusMap.set(testId, {
              testId,
              status: "completed",
              success: false,
              error: errorMessage,
              reportUrl: toUrlPath(
                `/api/test-results/${testId}/report/index.html`
              ),
            });

            resolve({
              success: false,
              error: errorMessage,
              testId,
              stdout,
              stderr,
              reportUrl: toUrlPath(
                `/api/test-results/${testId}/report/index.html`
              ),
            });
          } catch (writeError) {
            console.error(`Error creating error report: ${writeError}`);
            reject({
              success: false,
              error: `${errorMessage}\n\nAdditional error: Failed to create error report: ${writeError}`,
              testId,
              stdout,
              stderr,
              reportUrl: null,
            });
          }
          return;
        }

        // Check if the report exists
        if (!fs.existsSync(htmlReportPath)) {
          console.warn(
            `No HTML report found for test ${testId} even though it completed successfully`
          );

          // Create a basic report
          const successHtml = `
          <!DOCTYPE html>
          <html>
            <head>
              <title>Test Completed Successfully</title>
              <style>
                body {
                  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
                  background-color: #f8f8f8;
                  color: #333;
                  margin: 0;
                  padding: 20px;
                  line-height: 1.6;
                }
                .container {
                  max-width: 800px;
                  margin: 0 auto;
                  background-color: white;
                  border-radius: 8px;
                  box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                  padding: 20px;
                }
                h1 {
                  color: #16a34a;
                  margin-top: 0;
                }
                .success-box {
                  background-color: #f0fdf4;
                  border-left: 4px solid #16a34a;
                  padding: 15px;
                  margin: 20px 0;
                }
                pre {
                  background-color: #f1f5f9;
                  padding: 15px;
                  border-radius: 4px;
                  overflow-x: auto;
                }
              </style>
            </head>
            <body>
              <div class="container">
                <h1>Test Completed Successfully</h1>
                <div class="success-box">
                  <p>Your test ran successfully with no errors!</p>
                </div>
                <h2>Test Output</h2>
                <pre>${stdout}</pre>
              </div>
            </body>
          </html>
          `;

          try {
            await writeFile(htmlReportPath, successHtml);
          } catch (writeError) {
            console.error(`Error creating success report: ${writeError}`);
          }
        } else {
          // If the report exists, check if it's still the loading report
          try {
            const reportContent = await readFile(htmlReportPath, "utf8");
            if (reportContent.includes("Test Execution in Progress")) {
              // Test is complete but the report only shows loading,
              // likely because Playwright didn't generate a proper report
              const successHtml = `
              <!DOCTYPE html>
              <html>
                <head>
                  <title>Test Completed</title>
                  <style>
                    body {
                      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
                      background-color: #f8f8f8;
                      color: #333;
                      margin: 0;
                      padding: 20px;
                      line-height: 1.6;
                    }
                    .container {
                      max-width: 800px;
                      margin: 0 auto;
                      background-color: white;
                      border-radius: 8px;
                      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                      padding: 20px;
                    }
                    h1 {
                      color: #16a34a;
                      margin-top: 0;
                    }
                    .success-box {
                      background-color: #f0fdf4;
                      border-left: 4px solid #16a34a;
                      padding: 15px;
                      margin: 20px 0;
                    }
                    pre {
                      background-color: #f1f5f9;
                      padding: 15px;
                      border-radius: 4px;
                      overflow-x: auto;
                    }
                  </style>
                </head>
                <body>
                  <div class="container">
                    <h1>Test Completed Successfully</h1>
                    <div class="success-box">
                      <p>Your test ran successfully with no errors!</p>
                    </div>
                    <h2>Test Output</h2>
                    <pre>${stdout}</pre>
                  </div>
                </body>
              </html>
              `;

              await writeFile(htmlReportPath, successHtml);
            }
          } catch (readError) {
            console.error(`Error reading report file: ${readError}`);
          }
        }

        // Update the test status
        testStatusMap.set(testId, {
          testId,
          status: "completed",
          success: true,
          reportUrl: toUrlPath(`/api/test-results/${testId}/report/index.html`),
        });

        resolve({
          success: true,
          error: null,
          testId,
          stdout,
          stderr,
          reportUrl: toUrlPath(`/api/test-results/${testId}/report/index.html`),
        });
      });

      childProcess.on("error", (error) => {
        console.error(`Child process error for test ${testId}:`, error);
        clearTimeout(timeout);
        clearInterval(recoveryInterval); // Clear the recovery interval

        // Mark test as failed
        testStatusMap.set(testId, {
          testId,
          status: "completed",
          success: false,
          error: error.message,
          reportUrl: toUrlPath(`/api/test-results/${testId}/report/index.html`),
        });

        // Create an error report
        createErrorReport(
          htmlReportPath,
          `Test failed with error: ${error.message}`,
          stdoutChunks.join(""),
          stderrChunks.join("")
        )
          .then(() => {
            resolve({
              success: false,
              error: error.message,
              testId,
              stdout: stdoutChunks.join(""),
              stderr: stderrChunks.join(""),
              reportUrl: toUrlPath(
                `/api/test-results/${testId}/report/index.html`
              ),
            });
          })
          .catch((err) => {
            console.error(
              `Failed to create error report for test ${testId}:`,
              err
            );
            reject(err);
          });
      });
    } catch (error) {
      console.error(
        `Error in executeTestInChildProcess for test ${testId}:`,
        error
      );

      // Create an error report for the unexpected error
      try {
        // Define the htmlReportPath here since it might not be in scope
        const publicDir = normalize(join(process.cwd(), "public"));
        const testResultsDir = normalize(
          join(publicDir, "test-results", testId)
        );
        const reportDir = normalize(join(testResultsDir, "report"));
        const htmlReportPath = normalize(join(reportDir, "index.html"));

        await mkdir(dirname(htmlReportPath), { recursive: true });

        const errorHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Test Error</title>
            <style>
              body {
                font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
                margin: 0;
                padding: 20px;
                background-color: #1e1e1e;
                color: #d4d4d4;
              }
              .container {
                max-width: 800px;
                margin: 0 auto;
                background-color: #1e1e1e;
                padding: 20px;
                border-radius: 5px;
                box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);
              }
              h1 {
                color: #e06c75;
                margin-top: 0;
              }
              h2 {
                color: #e5c07b;
              }
              pre {
                background-color: #252526;
                padding: 15px;
                border-radius: 5px;
                overflow-x: auto;
                color: #d4d4d4;
                border: 1px solid #333;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>Unexpected Test Error</h1>
              <h2>Error Details</h2>
              <pre>${
                error instanceof Error ? error.message : String(error)
              }</pre>
              <h2>Stack Trace</h2>
              <pre>${
                error instanceof Error
                  ? error.stack
                  : "No stack trace available"
              }</pre>
            </div>
          </body>
        </html>
        `;

        await writeFile(htmlReportPath, errorHtml);

        // Update the test status
        testStatusMap.set(testId, {
          testId,
          status: "completed",
          success: false,
          error: error instanceof Error ? error.message : String(error),
          reportUrl: toUrlPath(`/api/test-results/${testId}/report/index.html`),
        });
      } catch (reportError) {
        console.error(
          `Failed to create error report for test ${testId}:`,
          reportError
        );
      }

      // Must reject the promise since we're in a catch block for the main promise
      reject({
        success: false,
        error: error instanceof Error ? error.message : String(error),
        testId,
        stdout: "",
        stderr: "",
        reportUrl: toUrlPath(`/api/test-results/${testId}/report/index.html`),
      });
    }
  });
}

/**
 * Helper function to create an error report
 */
async function createErrorReport(
  htmlReportPath: string,
  errorMessage: string,
  stdout: string,
  stderr: string
): Promise<void> {
  // Check if the report exists
  const reportExists = fs.existsSync(htmlReportPath);
  const errorHtml = `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Test Error</title>
      <style>
        body {
          font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
          margin: 0;
          padding: 20px;
          background-color: #1e1e1e;
          color: #d4d4d4;
        }
        .container {
          max-width: 800px;
          margin: 0 auto;
          background-color: #1e1e1e;
          padding: 20px;
          border-radius: 5px;
          box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);
        }
        h1 {
          color: #e06c75;
          margin-top: 0;
        }
        h2 {
          color: #e5c07b;
        }
        pre {
          background-color: #252526;
          padding: 15px;
          border-radius: 5px;
          overflow-x: auto;
          color: #d4d4d4;
          border: 1px solid #333;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Test Error</h1>
        <h2>Error Details</h2>
        <pre>${errorMessage}</pre>
        <h2>Test Output</h2>
        <pre>${stdout}</pre>
        <h2>Test Errors</h2>
        <pre>${stderr}</pre>
      </div>
    </body>
  </html>
  `;

  if (!reportExists) {
    // Create the report
    await mkdir(dirname(htmlReportPath), { recursive: true });
    await writeFile(htmlReportPath, errorHtml);
  } else {
    // Check if it's a loading report
    const reportContent = await readFile(htmlReportPath, "utf8");
    if (reportContent.includes("Test Execution in Progress")) {
      await writeFile(htmlReportPath, errorHtml);
    }
  }
}

/**
 * Execute a Playwright test script and generate HTML report
 */
export async function executeTest(code: string): Promise<TestResult> {
  // Generate a unique ID for this test run
  const testId = crypto.randomUUID();

  // Mark this test as active
  activeTestIds.add(testId);

  // Also add to recent tests with current timestamp
  recentTestIds.set(testId, Date.now());

  try {
    // Create necessary directories
    const publicDir = normalize(join(process.cwd(), "public"));
    const testResultsDir = normalize(join(publicDir, "test-results", testId));
    const reportDir = normalize(join(testResultsDir, "report"));
    const testsDir = normalize(join(publicDir, "tests"));
    let testPath = "";

    // Initialize the test status
    testStatusMap.set(testId, {
      testId,
      status: "pending",
    });

    // Create the directories
    await mkdir(testResultsDir, { recursive: true });
    await mkdir(reportDir, { recursive: true });
    await mkdir(testsDir, { recursive: true });

    // Validate the code
    const validationResult = validateCode(code);
    if (!validationResult.valid) {
      // Update test status
      testStatusMap.set(testId, {
        testId,
        status: "completed",
        success: false,
        error: validationResult.error || null,
        reportUrl: toUrlPath(`/api/test-results/${testId}/report/index.html`),
      });

      // Generate error report
      const errorHtml = `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Test Failed - Validation Error</title>
          <style>
            body {
              font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
              margin: 0;
              padding: 20px;
              background-color: #1e1e1e;
              color: #d4d4d4;
            }
            .container {
              max-width: 800px;
              margin: 0 auto;
              background-color: #1e1e1e;
              padding: 20px;
              border-radius: 5px;
              box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);
            }
            h3 {
              color: #e06c75;
              margin-top: 0;
            }
            pre {
              background-color: #252526;
              padding: 15px;
              border-radius: 5px;
              overflow-x: auto;
              color: #d4d4d4;
              border: 1px solid #333;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h3>Validation Error</h3>
            <pre>${validationResult.error || "Unknown validation error"}</pre>
          </div>
        </body>
      </html>
      `;

      // Define the report directory
      const publicDir = normalize(join(process.cwd(), "public"));
      const testResultsDir = normalize(join(publicDir, "test-results", testId));
      const reportDir = normalize(join(testResultsDir, "report"));

      // Ensure the directory exists
      await mkdir(dirname(join(reportDir, "index.html")), { recursive: true });
      await writeFile(join(reportDir, "index.html"), errorHtml);

      return {
        success: false,
        error: validationResult.error || null,
        reportUrl: toUrlPath(`/api/test-results/${testId}/report/index.html`),
        testId,
        stdout: "",
        stderr: validationResult.error || "",
      };
    }

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

    // Create an initial HTML report with loading indicator
    const loadingHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Test Execution in Progress</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f9f9f9;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
          }
          .container {
            text-align: center;
            background-color: white;
            padding: 40px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
            max-width: 500px;
          }
          h1 {
            color: #333;
            margin-bottom: 20px;
          }
          .spinner {
            border: 5px solid #f3f3f3;
            border-radius: 50%;
            border-top: 5px solid #3498db;
            width: 50px;
            height: 50px;
            margin: 20px auto;
            animation: spin 1s linear infinite;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          .info {
            margin-top: 20px;
            color: #666;
          }
          .reload-btn {
            margin-top: 30px;
            padding: 10px 20px;
            background-color: #3498db;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
          }
        </style>
        <script>
          // Auto-refresh the page every 3 seconds
          setTimeout(function() {
            location.reload();
          }, 3000);
        </script>
      </head>
      <body>
        <div class="container">
          <h1>Test Execution in Progress</h1>
          <div class="spinner"></div>
          <div class="info">
            <p>Test ID: ${testId}</p>
            <p>Started at: ${new Date().toLocaleString()}</p>
          </div>
        </div>
      </body>
    </html>
    `;

    // Save the loading report
    const htmlReportPath = normalize(join(reportDir, "index.html"));
    await writeFile(htmlReportPath, loadingHtml);

    // Update status with initial report URL
    testStatusMap.set(testId, {
      testId,
      status: "running",
      reportUrl: toUrlPath(`/api/test-results/${testId}/report/index.html`),
    });

    // Add the test to the queue and wait for it to complete
    return new Promise((resolve, reject) => {
      console.log(`Adding test to queue with ID: ${testId}`);
      testQueue.push({
        testId,
        testPath,
        code,
        resolve,
        reject,
      });
    });
  } catch (error) {
    console.error("Error setting up test:", error);

    let errorMessage = "Unknown error";
    if (error instanceof Error) {
      errorMessage = error.message;
    }

    // Create a minimal HTML report for the error case
    try {
      const errorHtml = `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Test Failed - Setup Error</title>
          <style>
            body {
              font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
              margin: 0;
              padding: 20px;
              background-color: #1e1e1e;
              color: #d4d4d4;
            }
            .container {
              max-width: 800px;
              margin: 0 auto;
              background-color: #1e1e1e;
              padding: 20px;
              border-radius: 5px;
              box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);
            }
            h1 {
              color: #e06c75;
              margin-top: 0;
            }
            h2 {
              color: #e5c07b;
            }
            pre {
              background-color: #252526;
              padding: 15px;
              border-radius: 5px;
              overflow-x: auto;
              color: #d4d4d4;
              border: 1px solid #333;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Test Failed</h1>
            <h2>Setup Error</h2>
            <pre>${errorMessage}</pre>
          </div>
        </body>
      </html>
      `;

      // Define the report directory
      const publicDir = normalize(join(process.cwd(), "public"));
      const testResultsDir = normalize(join(publicDir, "test-results", testId));
      const reportDir = normalize(join(testResultsDir, "report"));

      // Ensure the directory exists
      await mkdir(dirname(join(reportDir, "index.html")), { recursive: true });
      await writeFile(join(reportDir, "index.html"), errorHtml);

      // Update test status to completed with error
      testStatusMap.set(testId, {
        testId,
        status: "completed",
        success: false,
        error: errorMessage,
        reportUrl: toUrlPath(`/api/test-results/${testId}/report/index.html`),
      });
    } catch (reportError) {
      console.error("Error creating error report:", reportError);
    }

    return {
      success: false,
      error: errorMessage,
      reportUrl: toUrlPath(`/api/test-results/${testId}/report/index.html`),
      testId,
      stdout: "",
      stderr: errorMessage,
    };
  } finally {
    // Now that the test is complete, we can mark it as inactive
    activeTestIds.delete(testId);
  }
}

/**
 * Clean up orphaned test result directories that are older than the specified time
 * and remove unnecessary files in current test directories
 */
export async function cleanupTestResults(
  maxAgeMs = 24 * 60 * 60 * 1000 // 1 day - much longer retention
): Promise<void> {
  try {
    const now = Date.now();

    // Clean up the recentTestIds map to remove very old entries
    for (const [testId, timestamp] of recentTestIds.entries()) {
      if (now - timestamp > RECENT_TEST_WINDOW_MS) {
        recentTestIds.delete(testId);
      }
    }

    // Skip cleanup if it was done recently
    if (lastCleanupTime && now - lastCleanupTime < CLEANUP_INTERVAL) {
      console.log("Skipping cleanup - last cleanup was recent");
      return;
    }

    // Check if there are active tests - if so, delay aggressive cleanup
    if (activeTestIds.size > 0) {
      console.log(
        `Skipping cleanup because there are ${activeTestIds.size} active tests`
      );
      return; // Don't do ANY cleanup if tests are running
    }

    // Clean up public directory test results first (safer than root)
    const publicDir = normalize(join(process.cwd(), "public"));
    const testResultsDir = normalize(join(publicDir, "test-results"));

    if (fs.existsSync(testResultsDir)) {
      try {
        const dirs = await fs.promises.readdir(testResultsDir);

        // Only process directories older than the threshold
        // This is a much more conservative approach
        const cutoffTime = now - maxAgeMs;

        for (const dir of dirs) {
          const dirPath = normalize(join(testResultsDir, dir));

          // Skip active or recent tests
          if (activeTestIds.has(dir) || recentTestIds.has(dir)) {
            console.log(`Skipping cleanup for active/recent test: ${dir}`);
            continue;
          }

          try {
            const stats = await fs.promises.stat(dirPath);

            // Only delete very old directories - 7 days by default
            if (stats.isDirectory() && stats.mtimeMs < cutoffTime) {
              console.log(`Removing old test result directory: ${dirPath}`);
              await rm(dirPath, { recursive: true, force: true });
            }
          } catch (err) {
            console.warn(`Error processing ${dirPath}:`, err);
          }
        }
      } catch (error) {
        console.error("Error cleaning up public test results:", error);
      }
    }

    // Less aggressive root test-results directory cleanup
    try {
      const rootTestResultsPath = join(process.cwd(), "test-results");

      if (fs.existsSync(rootTestResultsPath)) {
        const rootDirs = await fs.promises.readdir(rootTestResultsPath);
        const cutoffTime = now - maxAgeMs;

        // Only delete files/directories older than the threshold (7 days)
        for (const item of rootDirs) {
          const itemPath = join(rootTestResultsPath, item);
          try {
            const stats = await fs.promises.stat(itemPath);

            if (stats.mtimeMs < cutoffTime) {
              if (stats.isDirectory()) {
                console.log(`Removing old root test directory: ${itemPath}`);
                await rm(itemPath, { recursive: true, force: true });
              } else {
                console.log(`Removing old root test file: ${itemPath}`);
                await unlink(itemPath);
              }
            }
          } catch (err) {
            console.warn(`Error processing root item ${itemPath}:`, err);
          }
        }
      }
    } catch (error) {
      console.error("Error cleaning up root test-results directory:", error);
    }

    // Only cleanup public/tests directory for very old files
    try {
      const publicTestsDir = normalize(join(publicDir, "tests"));

      if (fs.existsSync(publicTestsDir)) {
        const testFiles = await fs.promises.readdir(publicTestsDir);
        const cutoffTime = now - maxAgeMs;

        for (const file of testFiles) {
          const filePath = join(publicTestsDir, file);
          try {
            const stats = await fs.promises.stat(filePath);

            if (stats.mtimeMs < cutoffTime) {
              console.log(`Removing old test file: ${filePath}`);
              await unlink(filePath);
            }
          } catch (err) {
            console.warn(`Error processing test file ${filePath}:`, err);
          }
        }
      }
    } catch (error) {
      console.error("Error cleaning up public/tests directory:", error);
    }

    lastCleanupTime = now;
  } catch (error) {
    console.error("Error during cleanupTestResults:", error);
  }
}

// Less aggressive initial cleanup - don't aggressively clean on startup
setTimeout(() => {
  cleanupTestResults().catch((err) =>
    console.error("Initial cleanup failed:", err)
  );
}, 5 * 60 * 1000); // Wait 5 minutes after server start
