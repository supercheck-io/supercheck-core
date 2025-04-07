// Import child_process as a whole module to avoid Next.js dynamic import issues
import childProcess from "child_process";
import * as fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { validateCode } from "./code-validation";
import * as async from "async";
import crypto from "crypto";

const { spawn } = childProcess;
const { join, normalize, sep, posix, dirname } = path;

// Helper function to check if running on Windows
const isWindows = process.platform === "win32";

// Helper function to convert Windows paths to CLI-compatible paths
const toCLIPath = (filePath: string): string => {
  return isWindows ? filePath.split(sep).join("/") : filePath;
};

// Configure the maximum number of concurrent tests
const MAX_CONCURRENT_TESTS = 2;

// Maximum time to wait for a test to complete
const TEST_EXECUTION_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

// How often to recover trace files
const TRACE_RECOVERY_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// Track the last cleanup time to avoid too frequent cleanups

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

// Define the TestScript interface
interface TestScript {
  id: string;
  script: string;
  name?: string;
}

// Define the TestExecutionResult interface
interface TestExecutionResult {
  jobId: string;
  success: boolean;
  error?: string | null;
  reportUrl: string | null;
  results: Array<{
    testId: string;
    success: boolean;
    error: string | null;
    reportUrl?: string | null;
  }>;
  timestamp: string;
  stdout?: string;
  stderr?: string;
}

// A map to store the status of each test
const testStatusMap = new Map<string, TestStatusUpdate>();

// track active test IDs to prevent premature cleanup
const activeTestIds = new Set<string>();

// Keep a record of recent test IDs to avoid cleaning them up too soon
// Store with timestamp to know when they were created
const recentTestIds = new Map<string, number>();

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
        task.testPath
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
  command?: string
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
        await fs.mkdir(reportDir, { recursive: true });
        await fs.mkdir(tracesDir, { recursive: true });
        await fs.mkdir(screenshotsDir, { recursive: true });
        await fs.mkdir(videosDir, { recursive: true });
        await fs.mkdir(resultsDir, { recursive: true });
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
      .hidden { display: none; }
    </style>
    <script>
      document.addEventListener('DOMContentLoaded', function() {
        const testId = "${testId}";
        const eventSource = new EventSource('/api/test-status/sse/' + testId);
        
        eventSource.onmessage = function(event) {
          const data = JSON.parse(event.data);
          
          if (data.status === 'completed') {
            // Test is completed, reload to show the final report
            eventSource.close();
            window.location.reload();
          }
        };
        
        eventSource.onerror = function() {
          // If there's an error with the connection, fall back to reload after 10 seconds
          eventSource.close();
          setTimeout(function() { window.location.reload(); }, 10000);
        };
      });
    </script>
  </head>
  <body>
    <div class="container">
      <h1>Test Execution in Progress</h1>
      <div class="loading"><div class="spinner"></div><div>Running your tests...</div></div>
      <p>Test ID: <code>${testId}</code></p>
    </div>
  </body>
</html>`;

        await fs.mkdir(dirname(htmlReportPath), { recursive: true });
        await fs.writeFile(htmlReportPath, loadingHtml);

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
          if (!existsSync(tracesDir)) {
            await fs.mkdir(tracesDir, { recursive: true });
          }

          // Create common trace files to avoid ENOENT errors - optimized to only check and create necessary files
          for (const filePattern of commonTraceFiles) {
            // Create specific files if they don't exist
            if (!existsSync(filePattern)) {
              try {
                await fs.writeFile(filePattern, "");
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
          if (existsSync(rootTestResults)) {
            // Create placeholder files in this directory
            const rootTracesDir = join(rootTestResults, "traces");
            if (!existsSync(rootTracesDir)) {
              await fs.mkdir(rootTracesDir, { recursive: true });
              await fs.writeFile(
                join(rootTracesDir, "placeholder.network"),
                ""
              );
              await fs.writeFile(join(rootTracesDir, "placeholder.zip"), "");
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
      const commandToRun = command || (isWindows ? "npx.cmd" : "npx");

      // For Windows, ensure we use a path that works with Playwright CLI
      // Convert absolute path to a relative path from the current working directory
      let testPathArg = testPath;
      if (isWindows) {
        // Get the relative path from cwd to the test file
        const cwd = process.cwd();
        if (testPath.startsWith(cwd)) {
          // Make it relative to cwd
          testPathArg = testPath.substring(cwd.length + 1);
          // Ensure forward slashes for CLI arguments even on Windows
          testPathArg = testPathArg.split(sep).join("/");
        }
      }

      const args = command
        ? []
        : ["playwright", "test", testPathArg, "--config=playwright.config.mjs"];

      console.log(`Running command: ${commandToRun} ${args.join(" ")}`);

      // Spawn the child process with improved options
      const childProcess = spawn(commandToRun, args, {
        env: {
          ...process.env,
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
        windowsVerbatimArguments: isWindows, // Preserve quotes and special characters on Windows
        cwd: process.cwd(),
        // Set stdio to pipe to capture output
        stdio: ["ignore", "pipe", "pipe"],
        // Detach for better process management
        // detached: true,
      });

      // Process variables
      const stdoutChunks: string[] = [];
      const stderrChunks: string[] = [];

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
      // const startTime = Date.now();

      // Generate a timeout for the process
      const timeout = setTimeout(() => {
        if (childProcess && !childProcess.killed) {
          childProcess.kill();
          const timeoutError = "Test execution timed out after 2 minutes";
          console.error(timeoutError);

          // When test times out, we should still ensure we have a report
          try {
            if (existsSync(htmlReportPath)) {
              // Update the loading report with timeout information
              fs.readFile(htmlReportPath, "utf8")
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
                    fs.writeFile(htmlReportPath, timeoutHtml).catch((e) =>
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
              fs.writeFile(htmlReportPath, timeoutHtml).catch((e) =>
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
            testId,
            stdout: stdoutChunks.join(""),
            stderr: stderrChunks.join(""),
            reportUrl: toUrlPath(
              `/api/test-results/${testId}/report/index.html`
            ),
          });
        }
      }, TEST_EXECUTION_TIMEOUT_MS); // 15 minutes timeout

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
              await fs.mkdir(tracesDir, { recursive: true });
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
            if (!existsSync(htmlReportPath)) {
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

              await fs.writeFile(htmlReportPath, minimalHtml);
            } else {
              // If the report exists, check if it's still the loading report
              const reportContent = await fs.readFile(htmlReportPath, "utf8");
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

                await fs.writeFile(htmlReportPath, errorHtml);
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
        if (!existsSync(htmlReportPath)) {
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
            await fs.writeFile(htmlReportPath, successHtml);
          } catch (writeError) {
            console.error(`Error creating success report: ${writeError}`);
          }
        } else {
          // If the report exists, check if it's still the loading report
          try {
            const reportContent = await fs.readFile(htmlReportPath, "utf8");
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

              await fs.writeFile(htmlReportPath, successHtml);
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

        await fs.mkdir(dirname(htmlReportPath), { recursive: true });

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

        await fs.writeFile(htmlReportPath, errorHtml);

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
  const reportExists = existsSync(htmlReportPath);
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
    await fs.mkdir(dirname(htmlReportPath), { recursive: true });
    await fs.writeFile(htmlReportPath, errorHtml);
  } else {
    // Check if it's a loading report
    const reportContent = await fs.readFile(htmlReportPath, "utf8");
    if (reportContent.includes("Test Execution in Progress")) {
      await fs.writeFile(htmlReportPath, errorHtml);
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
    await fs.mkdir(testResultsDir, { recursive: true });
    await fs.mkdir(reportDir, { recursive: true });
    await fs.mkdir(testsDir, { recursive: true });

    // Validate the code - this must be done before any execution
    console.log(`Validating code for test ${testId}...`);
    const validationResult = validateCode(code);
    if (!validationResult.valid) {
      console.error(
        `Code validation failed for test ${testId}: ${validationResult.error}`
      );

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
      await fs.mkdir(dirname(join(reportDir, "index.html")), {
        recursive: true,
      });
      await fs.writeFile(join(reportDir, "index.html"), errorHtml);

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
    await fs.writeFile(testPath, testContent);

    // Create an initial HTML report with loading indicator
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
      .hidden { display: none; }
    </style>
    <script>
      document.addEventListener('DOMContentLoaded', function() {
        const testId = "${testId}";
        const eventSource = new EventSource('/api/test-status/sse/' + testId);
        
        eventSource.onmessage = function(event) {
          const data = JSON.parse(event.data);
          
          if (data.status === 'completed') {
            // Test is completed, reload to show the final report
            eventSource.close();
            window.location.reload();
          }
        };
        
        eventSource.onerror = function() {
          // If there's an error with the connection, fall back to reload after 10 seconds
          eventSource.close();
          setTimeout(function() { window.location.reload(); }, 10000);
        };
      });
    </script>
  </head>
  <body>
    <div class="container">
      <h1>Test Execution in Progress</h1>
      <div class="loading"><div class="spinner"></div><div>Running your tests...</div></div>
      <p>Test ID: <code>${testId}</code></p>
    </div>
  </body>
</html>`;

    // Save the loading report
    const htmlReportPath = normalize(join(reportDir, "index.html"));
    await fs.writeFile(htmlReportPath, loadingHtml);

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
      await fs.mkdir(dirname(join(reportDir, "index.html")), {
        recursive: true,
      });
      await fs.writeFile(join(reportDir, "index.html"), errorHtml);

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
 * Execute multiple test scripts in a single run and generate a combined HTML report
 */
export async function executeMultipleTests(
  testScripts: TestScript[],
  runId: string
): Promise<TestExecutionResult> {
  // Use the provided runId instead of generating a new one

  // Mark this run as active
  activeTestIds.add(runId);

  // Also add to recent tests with current timestamp
  recentTestIds.set(runId, Date.now());

  try {
    console.log(`Executing multiple tests with run ID ${runId}`);

    // Create a directory for the test files
    const publicDir = normalize(join(process.cwd(), "public"));
    const jobTestsDir = normalize(join(publicDir, "tests", runId));

    // Create run-specific report directory using runId
    const testResultsDir = normalize(join(publicDir, "test-results", runId));
    const reportDir = normalize(join(testResultsDir, "report"));

    // Initialize the test status
    testStatusMap.set(runId, {
      testId: runId,
      status: "pending",
    });

    // Create the directories
    await fs.mkdir(testResultsDir, { recursive: true });
    await fs.mkdir(reportDir, { recursive: true });
    await fs.mkdir(jobTestsDir, { recursive: true });

    console.log(`Created test directory: ${jobTestsDir}`);
    console.log(`Created report directory: ${reportDir}`);

    // Create individual test files for each test script
    const testFilePaths: string[] = [];

    for (const { id, script, name } of testScripts) {
      const testName = name || `Test ${id}`;
      const testFilePath = normalize(join(jobTestsDir, `${id}.spec.js`));

      // Validate the test script
      const validationResult = validateCode(script);

      if (!validationResult.valid) {
        console.error(
          `Code validation failed for test ${id}: ${validationResult.error}`
        );

        // Create a failing test file
        const failingTestCode = `
const { test, expect } = require('@playwright/test');

test('${testName} (ID: ${id})', async ({ page }) => {
  test.fail();
  console.log('Test validation failed: ${validationResult.error?.replace(
    /'/g,
    "\\'"
  )}');
  expect(false).toBeTruthy();
});
`;
        await fs.writeFile(testFilePath, failingTestCode);
      } else {
        // Write the original script to a file
        await fs.writeFile(testFilePath, script);
      }

      testFilePaths.push(testFilePath);
    }

    // Execute the tests
    const result = await executeMultipleTestFilesWithGlobalConfig(
      runId,
      testFilePaths,
      reportDir,
      jobTestsDir
    );

    // Parse the results for each test
    const individualResults = testScripts.map(({ id, name }) => {
      const testName = name || id;
      const testFilename = `${id}.spec.js`;

      // Improved patterns to detect success/failure in Playwright output
      const specificTestPattern = new RegExp(`${testFilename}`, "i");
      const specificTestFailedPattern = new RegExp(
        `${testFilename}.*?failed`,
        "i"
      );
      const specificTestPassedPattern = new RegExp(
        `${testFilename}.*?passed`,
        "i"
      );

      // Check if the test was mentioned in the output
      const testWasRun = specificTestPattern.test(result.stdout);
      const testFailed = specificTestFailedPattern.test(result.stdout);
      const testPassed = specificTestPassedPattern.test(result.stdout);

      // Check if the test was specifically mentioned in the failure output
      const isInFailureList =
        result.stdout.includes(`${testFilename}`) &&
        result.stdout.includes("failed") &&
        !result.stdout.includes(`${testFilename}.*?passed`);

      // A test is successful if:
      // 1. It explicitly shows as passed in the output, OR
      // 2. It was run and not explicitly mentioned in the failure list
      const success = testPassed || (testWasRun && !isInFailureList);

      console.log(`Test ${id} result analysis:`, {
        testWasRun,
        testPassed,
        testFailed,
        isInFailureList,
        overallSuccess: result.success,
        determinedSuccess: success,
      });

      return {
        testId: id,
        success,
        error: !success ? `Test ${testName} failed during execution` : null,
        reportUrl: `/api/test-results/${runId}/report/index.html`,
      };
    });

    // Overall success is true if all individual tests succeeded
    const overallSuccess = individualResults.every((result) => result.success);

    // Update the test status to completed
    testStatusMap.set(runId, {
      testId: runId,
      status: "completed",
      success: overallSuccess,
      error: result.error,
      reportUrl: `/api/test-results/${runId}/report/index.html`,
    });

    return {
      jobId: runId,
      success: overallSuccess,
      reportUrl: `/api/test-results/${runId}/report/index.html`,
      results: individualResults,
      timestamp: new Date().toISOString(),
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } catch (error) {
    console.error(`Error executing tests for run ${runId}:`, error);

    // Update test status to completed with error
    const errorMessage = error instanceof Error ? error.message : String(error);
    testStatusMap.set(runId, {
      testId: runId,
      status: "completed",
      success: false,
      error: errorMessage,
    });

    return {
      jobId: runId,
      success: false,
      error: errorMessage,
      reportUrl: null,
      results: testScripts.map(({ id }) => ({
        testId: id,
        success: false,
        error: errorMessage,
      })),
      timestamp: new Date().toISOString(),
      stdout: "",
      stderr:
        error instanceof Error ? error.stack || error.message : String(error),
    };
  } finally {
    // Remove the test from active tests
    activeTestIds.delete(runId);
  }
}

/**
 * Execute multiple test files with Playwright using the global config
 */
async function executeMultipleTestFilesWithGlobalConfig(
  testId: string,
  testFilePaths: string[],
  reportDir: string,
  jobTestsDir: string
): Promise<TestResult> {
  return new Promise(async (resolve, reject) => {
    try {
      console.log(
        `Executing multiple test files for run ${testId} using global config`
      );

      // Create necessary directories for traces
      const publicDir = normalize(join(process.cwd(), "public"));
      const testResultsDir = normalize(join(publicDir, "test-results", testId));
      const tracesDir = normalize(join(testResultsDir, "traces"));

      await fs.mkdir(tracesDir, { recursive: true });

      // Create empty trace files to avoid ENOENT errors
      const traceFiles = [
        `${testId}-recording1.network`,
        `${testId}.network`,
        `${testId}-recording1.zip`,
        `${testId}.zip`,
      ];

      for (const traceFile of traceFiles) {
        const tracePath = normalize(join(tracesDir, traceFile));
        await fs.writeFile(tracePath, "");
        console.log(`Created empty trace file to avoid ENOENT: ${tracePath}`);
      }

      // Determine the command to run based on the OS
      const isWindows = process.platform === "win32";
      const command = isWindows ? "npx.cmd" : "npx";

      // Build the arguments for the command
      const args = [
        "playwright",
        "test",
        ...testFilePaths.map((path) => toCLIPath(path)),
        "--config=playwright.config.mjs",
      ];

      console.log(`Running command: ${command} ${args.join(" ")}`);

      // Set environment variables for the test directory and report directory
      const env = {
        ...process.env,
        PAGER: "cat",
        // Set environment variables for Playwright config
        PLAYWRIGHT_TEST_DIR: jobTestsDir,
        PLAYWRIGHT_REPORT_DIR: reportDir,
      };

      console.log(`Using test directory: ${jobTestsDir}`);
      console.log(`Using report directory: ${reportDir}`);

      // Spawn the child process with the environment variables
      const childProcess = spawn(command, args, {
        env,
        stdio: ["pipe", "pipe", "pipe"],
        shell: isWindows, // Use shell on Windows to avoid EINVAL errors
        windowsVerbatimArguments: isWindows, // Preserve quotes and special characters on Windows
        cwd: process.cwd(),
      });

      let stdout = "";
      let stderr = "";

      childProcess.stdout.on("data", (data) => {
        const chunk = data.toString();
        stdout += chunk;
        console.log(`[Test ${testId}] ${chunk}`);
      });

      childProcess.stderr.on("data", (data) => {
        const chunk = data.toString();
        stderr += chunk;
        console.error(`[Test ${testId}] ${chunk}`);
      });

      childProcess.on("error", (error) => {
        console.error(`Child process error for test ${testId}:`, error);
        resolve({
          testId,
          success: false,
          error: error.message,
          reportUrl: `/api/test-results/${testId}/report/index.html`,
          stdout,
          stderr,
        });
      });

      childProcess.on("close", (code, signal) => {
        console.log(
          `Child process for test ${testId} exited with code: ${code}, signal: ${signal}`
        );

        if (code !== 0) {
          console.log(
            `Test ${testId} failed: Test failed with exit code ${code}`
          );
          resolve({
            testId,
            success: false,
            error: `Test failed with exit code ${code}`,
            reportUrl: `/api/test-results/${testId}/report/index.html`,
            stdout,
            stderr,
          });
        } else {
          console.log(`Test ${testId} completed successfully`);
          resolve({
            testId,
            success: true,
            error: null,
            reportUrl: `/api/test-results/${testId}/report/index.html`,
            stdout,
            stderr,
          });
        }
      });
    } catch (error) {
      console.error(`Error executing test ${testId}:`, error);
      reject(error);
    }
  });
}
