// Import child_process as a whole module to avoid Next.js dynamic import issues
import childProcess from "child_process";
import * as fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { validateCode } from "./code-validation";
import crypto from "crypto";
// Import S3 storage utilities
import { uploadDirectory } from "./s3-storage";
// Import database client and reports table
import { getDb } from "@/db/client";
import { reports } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { spawn } from 'child_process';
import { execFile } from 'child_process';
import util from 'util';
import async from 'async';

// Reference for the test status map, will be imported from queue.ts
let testStatusMapRef: any = null;

// Remove import of queue functions at the top level to make them lazy loaded
// They will be imported only when needed

const { join, normalize, sep, posix, dirname } = path;

// Helper function to check if running on Windows
const isWindows = process.platform === "win32";

// Helper function to convert Windows paths to CLI-compatible paths
const toCLIPath = (filePath: string): string => {
  return isWindows ? filePath.split(sep).join("/") : filePath;
};

// Configure the maximum number of concurrent tests
const MAX_CONCURRENT_TESTS = parseInt(process.env.MAX_CONCURRENT_TESTS || '2');

// Maximum time to wait for a test to complete
const TEST_EXECUTION_TIMEOUT_MS = parseInt(process.env.TEST_EXECUTION_TIMEOUT_MS || '900000'); // 15 minutes (15 * 60 * 1000)

// Constants for cleanup operations
const CLEANUP_INTERVAL = 300000; // 5 minutes in milliseconds
const CLEANUP_THRESHOLD = 3600000; // 1 hour in milliseconds

// Maximum number of recent jobs to track to prevent duplicates
const MAX_TRACKED_JOBS = 100;

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

// Function to get the right path based on whether it's a job or individual test
function getResultsPath(testId: string, isJob: boolean = false): string {
  const basePath = join(process.cwd(), "public", "test-results");
  const typePath = isJob ? "jobs" : "tests";
  return join(basePath, typePath, testId);
}

// Function to store report metadata
async function storeReportMetadata(entityId: string, entityType: "test" | "job", reportPath: string): Promise<void> {
  try {
    console.log(`Storing report metadata for ${entityType}/${entityId}`);
    const db = await getDb();
    
    // Check if metadata already exists
    const existing = await db.select()
      .from(reports)
      .where(and(
        eq(reports.entityId, entityId),
        eq(reports.entityType, entityType)
      ))
      .execute();
    
    if (existing.length > 0) {
      // Update existing metadata
      await db.update(reports)
        .set({
          reportPath,
          status: 'completed',
          updatedAt: new Date()
        })
        .where(and(
          eq(reports.entityId, entityId),
          eq(reports.entityType, entityType)
        ))
        .execute();
    } else {
      // Insert new metadata
      await db.insert(reports)
        .values({
          entityId,
          entityType,
          reportPath,
          status: 'completed',
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .execute();
    }
    
    console.log(`Successfully stored report metadata for ${entityType}/${entityId}`);
  } catch (error) {
    // Log but don't fail the process
    console.error(`Error storing report metadata for ${entityType}/${entityId}:`, error);
  }
}

// Replace the sync worker initialization with a lazy-loading function
let queueInitialized = false;
let queueInitializing = false;
let queueInitPromise: Promise<void> | null = null;

// Lazy load and initialize the queue only when needed for test execution
async function ensureQueueInitialized(): Promise<void> {
  if (queueInitialized) {
    return;
  }
  
  if (queueInitializing) {
    console.log("Queue initialization already in progress, waiting...");
    return queueInitPromise!;
  }
  
  queueInitializing = true;
  console.log("Lazy-initializing test and job workers...");
  
  queueInitPromise = (async () => {
    try {
      const {
        setTestStatusMap,
        setupTestExecutionWorker,
        setupJobExecutionWorker,
        TEST_EXECUTION_QUEUE,
        JOB_EXECUTION_QUEUE
      } = await import('./queue');
      
      // Set up the shared status map reference
      setTestStatusMap(testStatusMap);
      // Import the testStatusMapRef from queue for bidirectional updates
      const queueModule = await import('./queue');
      testStatusMapRef = queueModule.testStatusMapRef;

      // Initialize test execution worker
      await setupTestExecutionWorker(MAX_CONCURRENT_TESTS, async (task) => {
        try {
          console.log(`Worker processing test execution for ${task.testId}`);
          
          // Update the test status to running
          testStatusMap.set(task.testId, {
            testId: task.testId,
            status: "running",
          });

          // Execute the test
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

          // Store report metadata for faster access
          if (result.success && result.reportUrl) {
            // Extract the report path from the URL
            const urlPath = result.reportUrl.split('/api/test-results')[1];
            const reportPathParts = urlPath.split('/');
            // Remove the file part (index.html) and query params
            const reportDir = reportPathParts.slice(0, reportPathParts.length - 1).join('/').split('?')[0];
            
            // Store metadata
            await storeReportMetadata(task.testId, 'test', reportDir);
          }

          console.log(`Test ${task.testId} completed with success: ${result.success}`);
          
          // Ensure we return a complete TestResult object
          const completeResult: TestResult = {
            success: result.success,
            error: result.error,
            reportUrl: result.reportUrl,
            testId: task.testId,
            stdout: result.stdout || "",
            stderr: result.stderr || ""
          };
          
          return completeResult;
        } catch (error) {
          // Error handling code
          console.error(`Error in test worker for ${task.testId}:`, error);
          
          const errorMessage = error instanceof Error ? error.message : String(error);
          
          testStatusMap.set(task.testId, {
            testId: task.testId,
            status: "completed",
            success: false,
            error: errorMessage,
            reportUrl: task.testId ? toUrlPath(`/api/test-results/tests/${task.testId}/report/index.html`) : null,
          });
          
          const errorResult: TestResult = {
            success: false,
            error: errorMessage,
            testId: task.testId,
            stdout: "",
            stderr: errorMessage,
            reportUrl: task.testId ? toUrlPath(`/api/test-results/tests/${task.testId}/report/index.html`) : null
          };
          
          return errorResult;
        }
      });
      
      // Initialize job execution worker
      await setupJobExecutionWorker(
        Math.max(1, Math.floor(MAX_CONCURRENT_TESTS / 2)),
        async (task) => {
          try {
            console.log(`Job worker started processing job ID: ${task.jobId}`);
            
            // === Worker Logic Start ===
            // Prepare paths and test files similar to executeMultipleTests setup
            const runId = task.jobId; // Use jobId as runId for consistency
            const testScripts = task.testScripts;

            const publicDir = normalize(join(process.cwd(), "public"));
            const jobTestsDir = normalize(join(publicDir, "tests", runId));
            const testResultsDir = normalize(getResultsPath(runId, true));
            const reportDir = normalize(join(testResultsDir, "report"));
            const htmlReportPath = normalize(join(reportDir, "index.html"));

            // Ensure directories exist (might be redundant if created earlier, but safe)
            await fs.mkdir(reportDir, { recursive: true });
            await fs.mkdir(jobTestsDir, { recursive: true });
            
            // Create individual test files (this duplicates setup in executeMultipleTests, consider refactoring later)
            const testFilePaths: string[] = [];
            for (const { id, script, name } of testScripts) {
                const testName = name || `Test ${id}`;
                const testFilePath = normalize(join(jobTestsDir, `${id}.spec.js`));
                const validationResult = validateCode(script);

                if (!validationResult.valid) {
                    console.error(`Code validation failed for test ${id} in worker: ${validationResult.error}`);
                    const failingTestCode = `
const { test, expect } = require('@playwright/test');
test('${testName} (ID: ${id})', async ({ page }) => {
  test.fail(); console.log('Test validation failed: ${validationResult.error?.replace(/'/g, "\'")}')
  expect(false).toBeTruthy();
});`;
                    await fs.writeFile(testFilePath, failingTestCode);
                } else {
                    await fs.writeFile(testFilePath, script);
                }
                testFilePaths.push(testFilePath);
            }

            // Execute the tests using the new helper function
            const result = await _runJobTests(
              runId,
              testScripts,
              jobTestsDir,
              reportDir,
              testFilePaths
            );
            
            // S3 Upload and Metadata storage are now handled within _runJobTests
            
            console.log(`Job worker successfully processed job ID: ${task.jobId}, Success: ${result.success}`);
            return result;
            // === Worker Logic End ===

          } catch (error) {
            // Error handling code for the worker itself
            console.error(`Error in job worker for ${task.jobId}:`, error);
            
            const errorMessage = error instanceof Error ? error.message : String(error);
            
            // Return a structured error result
            return {
              jobId: task.jobId,
              success: false,
              error: errorMessage,
              reportUrl: task.jobId ? toUrlPath(`/api/test-results/jobs/${task.jobId}/report/index.html`) : null,
              results: task.testScripts.map(script => ({
                testId: script.id,
                success: false,
                error: errorMessage,
              })),
              timestamp: new Date().toISOString(),
              stdout: "",
              stderr: error instanceof Error ? error.stack || errorMessage : errorMessage,
            };
          }
        }
      );

      console.log('Queue initialization complete');
      queueInitialized = true;
    } catch (error) {
      console.error('Failed to initialize queue:', error);
      // Reset state so we can try again
      queueInitialized = false;
      queueInitializing = false;
      queueInitPromise = null;
      throw error;
    } finally {
      queueInitializing = false;
    }
  })();
  
  return queueInitPromise;
}

// Get content type based on file extension
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

      const testResultsDir = normalize(getResultsPath(testId));
      const reportDir = normalize(join(testResultsDir, "report"));
      const htmlReportPath = normalize(join(reportDir, "index.html"));
      
      try {
        // Use a single mkdir call with recursive option to create only the report directory
        await fs.mkdir(reportDir, { recursive: true });
        // Remove traces directory creation
        // await fs.mkdir(tracesDir, { recursive: true });
      } catch (err) {
        console.warn(
          `Warning: Failed to create directories for test ${testId}:`,
          err
        );
        // Continue execution, as Playwright will try to create them again
      }

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

      // Remove the --output flag to prevent playwright-output folder creation
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
          // Set HTML report directory but remove traces directory
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
          const timeoutError = "Test execution timed out";
          console.error(timeoutError);

          // Update the test status
          testStatusMap.set(testId, {
            testId,
            status: "completed",
            success: false,
            error: timeoutError,
            reportUrl: toUrlPath(
              `/api/test-results/tests/${testId}/report/index.html`
            ),
          });

          reject({
            success: false,
            error: timeoutError,
            testId,
            stdout: stdoutChunks.join(""),
            stderr: stderrChunks.join(""),
            reportUrl: toUrlPath(
              `/api/test-results/tests/${testId}/report/index.html`
            ),
          });
        }
      }, TEST_EXECUTION_TIMEOUT_MS); // 15 minutes timeout

      childProcess.on("exit", async (code, signal) => {
        clearTimeout(timeout);
        // Remove the recovery interval since we've removed the recovery function
        // clearInterval(recoveryInterval);

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
              await fs.mkdir(testResultsDir, { recursive: true });
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
            }

            // Update the test status
            testStatusMap.set(testId, {
              testId,
              status: "completed",
              success: false,
              error: errorMessage,
              reportUrl: toUrlPath(
                `/api/test-results/tests/${testId}/report/index.html`
              ),
            });

            resolve({
              success: false,
              error: errorMessage,
              testId,
              stdout,
              stderr,
              reportUrl: toUrlPath(
                `/api/test-results/tests/${testId}/report/index.html`
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
          console.log(
            `No HTML report found for test ${testId} even though it completed successfully`
          );
        }

        // Update the test status
        testStatusMap.set(testId, {
          testId,
          status: "completed",
          success: true,
          reportUrl: toUrlPath(`/api/test-results/tests/${testId}/report/index.html`),
        });

        resolve({
          success: true,
          error: null,
          testId,
          stdout,
          stderr,
          reportUrl: toUrlPath(`/api/test-results/tests/${testId}/report/index.html`),
        });
      });

      childProcess.on("error", (error) => {
        console.error(`Child process error for test ${testId}:`, error);
        clearTimeout(timeout);
        // Remove the recovery interval since we've removed the recovery function
        // clearInterval(recoveryInterval);

        // Mark test as failed
        testStatusMap.set(testId, {
          testId,
          status: "completed",
          success: false,
          error: error.message,
          reportUrl: toUrlPath(`/api/test-results/tests/${testId}/report/index.html`),
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
                `/api/test-results/tests/${testId}/report/index.html`
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
          reportUrl: toUrlPath(`/api/test-results/tests/${testId}/report/index.html`),
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
        reportUrl: toUrlPath(`/api/test-results/tests/${testId}/report/index.html`),
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
        :root {
          --bg-color: #f8f9fc;
          --text-color: #1e293b;
          --container-bg: white;
          --container-shadow: rgba(0, 0, 0, 0.1);
          --error-color: #dc2626;
          --muted-color: #64748b;
          --details-bg: #f1f5f9;
          --details-text: #334155;
          --details-title: #0f172a;
        }
        
        @media (prefers-color-scheme: dark) {
          :root {
            --bg-color: #1e1e1e;
            --text-color: #f1f5f9;
            --container-bg: #2d3748;
            --container-shadow: rgba(0, 0, 0, 0.3);
            --error-color: #dc2626;
            --muted-color: #94a3b8;
            --details-bg: #1e293b;
            --details-text: #cbd5e1;
            --details-title: #f1f5f9;
          }
        }

        body {
          font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
          margin: 0;
          padding: 20px;
          background-color: var(--bg-color);
          color: var(--text-color);
          display: flex;
          min-height: 100vh;
          overflow: hidden;
          position: relative;
        }
        .container {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          transform: translate(-50%, calc(-50% - 50px));
          max-width: 500px;
          padding: 2rem;
          border-radius: 8px;
          text-align: center;
          overflow-y: hidden;
        }
        .icon {
          color: var(--error-color);
          font-size: 64px;
          margin-bottom: 1rem;
          display: flex;
          justify-content: center;
        }
        .icon svg {
          width: 64px;
          height: 64px;
          stroke-width: 2.5;
        }
        h1 {
          font-size: 1.875rem;
          font-weight: bold;
          margin-bottom: 0.5rem;
          color: var(--text-color);
        }
        .message {
          color: var(--muted-color);
          margin-bottom: 1.5rem;
        }
        .details {
          background-color: var(--details-bg);
          padding: 1rem;
          border-radius: 6px;
          text-align: left;
          font-family: monospace;
          font-size: 0.875rem;
          overflow-x: auto;
          margin-top: 1rem;
          white-space: pre-wrap;
          word-break: break-word;
          color: var(--details-text);
        }
        .details-title {
          font-weight: bold;
          margin-bottom: 0.5rem;
          color: var(--details-title);
        }
        .hint {
          font-size: 0.875rem;
          margin-top: 1rem;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        </div>
        <h1>Script Validation Error</h1>
        <div class="message">${errorMessage}</div>
        <div class="hint">Please check and fix your script in the editor tab</div>
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
    // if (reportContent.includes("Test Execution in Progress")) {
    //   await fs.writeFile(htmlReportPath, errorHtml);
    // }
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

  // Define result variable at the top level of the function to ensure it's in scope
  let result: TestResult = {
    success: false,
    error: "Test execution not completed",
    reportUrl: null,
    testId,
    stdout: "",
    stderr: ""
  };

  try {
    // Create necessary directories
    const publicDir = normalize(join(process.cwd(), "public"));
    const testResultsDir = normalize(getResultsPath(testId));
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
        reportUrl: toUrlPath(`/api/test-results/tests/${testId}/report/index.html`),
      });

      // Create an error report for validation failure
      const htmlReportPath = normalize(join(reportDir, "index.html"));
      await createErrorReport(
        htmlReportPath,
        validationResult.error || "Code validation failed",
        "",
        validationResult.error || ""
      );

      // Assign to the outer result variable
      result = {
        success: false,
        error: validationResult.error || null,
        reportUrl: toUrlPath(`/api/test-results/tests/${testId}/report/index.html`),
        testId,
        stdout: "",
        stderr: validationResult.error || "",
      };

      return result;
    }

    // Optionally remove screenshot steps
    code = code.replace(
      /\s*await\s+page\.screenshot\(\s*{\s*path\s*:\s*['"].*?['"]\s*}\s*\);?/g,
      ""
    );

    // Create a unique test file
    testPath = normalize(join(testsDir, `${testId}.spec.js`));

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

    // No longer creating a loading HTML report here, as we're using SSE
    // Ensure the report directory exists
    const htmlReportPath = normalize(join(reportDir, "index.html"));
    await fs.mkdir(dirname(htmlReportPath), { recursive: true });

    // Update status with report URL that will be created when test completes
    testStatusMap.set(testId, {
      testId,
      status: "running",
      reportUrl: toUrlPath(`/api/test-results/tests/${testId}/report/index.html`),
    });

    // Initialize the queue when needed - dynamic import
    await ensureQueueInitialized();
    
    // Dynamically import the queue functions only when needed
    const { addTestToQueue, waitForJobCompletion } = await import('./queue');
    
    try {
      // Add the test to the queue
      const task = { testId, testPath };
      const queuedJobId = await addTestToQueue(task);
      console.log(`Test ${testId} queued successfully with job ID: ${queuedJobId}`);
      
      // Wait for the job to complete
      const testResult = await waitForJobCompletion<TestResult>(testId, TEST_EXECUTION_TIMEOUT_MS);
      
      // Assign to the outer result variable
      result = testResult;
      
      // Check if the result has all required fields
      if (!result || typeof result !== 'object') {
        throw new Error('Invalid result format received from test execution');
      }
      
      // Check if the result has all required fields
      if (!('success' in result) || !('testId' in result)) {
        // Try to reconstruct a valid result
        console.warn(`Incomplete result received for test ${testId}, attempting to reconstruct`);
        
        // Log what we received for debugging
        console.log('Received incomplete result:', result);
        
        // Get status from status map as a fallback
        const status = testStatusMap.get(testId);
        
        if (status && status.status === 'completed') {
          // Create a complete result object
          const reconstructedResult: TestResult = {
            success: !!status.success,
            error: status.error || null,
            reportUrl: status.reportUrl || null,
            testId,
            stdout: typeof result === 'object' && result && 'stdout' in result ? (result as any).stdout : '',
            stderr: status.error || ''
          };
          
          console.log(`Using reconstructed result for test ${testId}`);
          return reconstructedResult;
        } else {
          // If we don't have a status but have some result, try to use it
          if (typeof result === 'object' && result) {
            const resultObj = result as Record<string, any>;
            const patchedResult: TestResult = {
              success: 'success' in resultObj ? !!resultObj.success : true,
              error: 'error' in resultObj ? resultObj.error : null,
              reportUrl: 'reportUrl' in resultObj ? resultObj.reportUrl : 
                                toUrlPath(`/api/test-results/tests/${testId}/report/index.html`),
              testId,
              stdout: 'stdout' in resultObj ? resultObj.stdout : '',
              stderr: 'stderr' in resultObj ? resultObj.stderr : ''
            };
            
            console.log(`Created patched result for test ${testId}`);
            return patchedResult;
          }
        }
      }
      
      // If we got here, the result has the required fields
      return result as TestResult;
    } catch (waitError) {
      console.error(`Error waiting for test ${testId} completion:`, waitError);
      
      // Check if the test might have completed despite the error
      const status = testStatusMap.get(testId);
      
      if (status && status.status === 'completed') {
        console.log(`Test ${testId} appears to be completed despite queue error, using status data`);
        
        // Construct result from status
        const fallbackResult: TestResult = {
          success: !!status.success,
          error: status.error || (waitError instanceof Error ? waitError.message : String(waitError)),
          reportUrl: status.reportUrl || null,
          testId,
          stdout: '',
          stderr: (waitError instanceof Error ? waitError.message : String(waitError))
        };
        
        return fallbackResult;
      }
      
      // If we get here, we need to create an error report
      const errorHtml = `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Test Failed - Queue Error</title>
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
            <h2>Queue Error</h2>
            <pre>${waitError instanceof Error ? waitError.message : String(waitError)}</pre>
          </div>
        </body>
      </html>`;
      
      // Update the report with error
      const htmlReportPath = normalize(join(reportDir, "index.html"));
      await fs.writeFile(htmlReportPath, errorHtml).catch(err => 
        console.error(`Failed to write error report for ${testId}:`, err)
      );
      
      // Update test status
      testStatusMap.set(testId, {
        testId,
        status: "completed",
        success: false,
        error: `Queue error: ${waitError instanceof Error ? waitError.message : String(waitError)}`,
        reportUrl: toUrlPath(`/api/test-results/tests/${testId}/report/index.html`),
      });
      
      // Assign to the outer result variable
      result = {
        success: false,
        error: `Queue error: ${waitError instanceof Error ? waitError.message : String(waitError)}`,
        reportUrl: toUrlPath(`/api/test-results/tests/${testId}/report/index.html`),
        testId,
        stdout: "",
        stderr: (waitError instanceof Error ? waitError.message : String(waitError))
      };
    }

    // Store report metadata if the test was successful
    if (result.success && result.reportUrl) {
      try {
        // Extract the report path from the URL
        const urlPath = result.reportUrl.split('/api/test-results')[1];
        const reportPathParts = urlPath.split('/');
        // Remove the file part (index.html) and query params
        const reportDir = reportPathParts.slice(0, reportPathParts.length - 1).join('/').split('?')[0];
        
        // Store metadata
        await storeReportMetadata(testId, 'test', reportDir);
      } catch (metadataError) {
        console.error(`Error storing report metadata for test ${testId}:`, metadataError);
        // Don't fail the test if metadata storage fails
      }
    }

    console.log(`Test ${testId} completed with result:`, {
      success: result.success,
      error: result.error,
      reportUrl: result.reportUrl,
    });

    return result;
  } catch (error) {
    console.error("Error setting up test:", error);

    let errorMessage = "Unknown error";
    if (error instanceof Error) {
      errorMessage = error.message;
    }

    // Update test status directly
    testStatusMap.set(testId, {
      testId,
      status: "completed",
      success: false,
      error: errorMessage,
      reportUrl: toUrlPath(`/api/test-results/tests/${testId}/report/index.html`),
    });

    // Assign error result
    result = {
      success: false,
      error: errorMessage,
      reportUrl: toUrlPath(`/api/test-results/tests/${testId}/report/index.html`),
      testId,
      stdout: "",
      stderr: errorMessage,
    };

    return result;
  } finally {
    // Now that the test is complete, we can mark it as inactive
    activeTestIds.delete(testId);
  }
}

// Track executed jobs to prevent duplicates
const executedJobs = new Set<string>();

/**
 * Execute multiple tests for a job and generate reports
 * @param testScripts Array of test scripts to execute
 * @param jobId ID of the job
 * @returns Object containing success status and execution details
 */
export async function executeMultipleTests(
  testScripts: Array<{ id: string; script: string; name?: string }>,
  jobId: string
): Promise<{
  success: boolean;
  stdout: string;
  stderr?: string;
  error?: string;
  reportUrl?: string;
  jobId?: string;
}> {
  // Prevent duplicate executions of the same job
  if (executedJobs.has(jobId)) {
    console.log(`Job ${jobId} was already executed recently, preventing duplicate execution`);
    return {
      success: false,
      stdout: "Job already executed",
      error: "This job was already executed recently. Please check previous runs.",
      jobId
    };
  }
  
  // Add job to tracking set (limiting size to prevent memory leaks)
  executedJobs.add(jobId);
  if (executedJobs.size > MAX_TRACKED_JOBS) {
    const oldestJob = executedJobs.values().next().value;
    if (oldestJob) {
      executedJobs.delete(oldestJob);
    }
  }

  // Check if we have any test scripts
  if (!testScripts || testScripts.length === 0) {
    return {
      success: false,
      stdout: "No test scripts provided",
      error: "No test scripts provided to execute",
      jobId
    };
  }

  console.log(`Executing ${testScripts.length} tests for job ${jobId}`);
  
  // Set up directories for test results and reports
  const testResultsDir = normalize(join(process.cwd(), "public", "test-results"));
  const jobResultsDir = normalize(join(testResultsDir, "jobs", jobId));
  const reportDir = normalize(join(jobResultsDir, "report"));
  const testsDir = normalize(join(jobResultsDir, "tests"));
  
  console.log(`Results directory: ${jobResultsDir}`);
  console.log(`Report directory: ${reportDir}`);
  console.log(`Tests directory: ${testsDir}`);
  
  // Ensure directories exist
  for (const dir of [testResultsDir, jobResultsDir, reportDir, testsDir]) {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      console.error(`Error creating directory ${dir}:`, error);
      return {
        success: false,
        stdout: `Failed to create required directories: ${error instanceof Error ? error.message : String(error)}`,
        error: `Failed to create required directories: ${error instanceof Error ? error.message : String(error)}`,
        jobId
      };
    }
  }
  
  // Create test files from the scripts
  let testFilePaths: string[] = [];

  // Validate and create each test script
  let validScripts = 0;
  
  for (const { id, script } of testScripts) {
    if (!script || !script.trim()) {
      console.warn(`Script for test ${id} is empty, skipping`);
      continue;
    }
    
    try {
      const testPath = normalize(join(testsDir, `${id}.spec.js`));
      await fs.writeFile(testPath, script);
      console.log(`Created test file: ${testPath}`);
      testFilePaths.push(testPath);
      validScripts++;
    } catch (error) {
      console.error(`Error creating test file for ${id}:`, error);
      // Continue to try other scripts
    }
  }
  
  // If no valid scripts, create a failing test
  if (validScripts === 0) {
    console.warn("No valid test scripts provided, creating a failing test");
    
    const failingTestPath = normalize(join(testsDir, "failing-test.spec.js"));
    const failingTest = `
      const { test, expect } = require('@playwright/test');
      
      test('Failing test due to invalid test scripts', async () => {
        console.error('No valid test scripts were provided for this job');
        expect(false).toBeTruthy();
      });
    `;
    
    try {
      await fs.writeFile(failingTestPath, failingTest);
      console.log(`Created failing test file: ${failingTestPath}`);
      testFilePaths.push(failingTestPath);
    } catch (error) {
      console.error(`Failed to create failing test file:`, error);
      return {
        success: false,
        stdout: "",
        error: `Failed to create test files: ${error instanceof Error ? error.message : String(error)}`,
        jobId
      };
    }
  }
  
  // Execute the tests
  try {
    console.log(`Executing ${testFilePaths.length} test files for job ${jobId}`);
    const result = await executeMultipleTestFilesWithGlobalConfig(
      jobId,
      testFilePaths,
      reportDir,
      testsDir
    );
    
    // Generate the report URL (both internal and external paths)
    const internalReportUrl = `/api/test-results/jobs/${jobId}/report/index.html`;
    const externalReportUrl = toUrlPath(internalReportUrl);
    
    // Check if the report exists
    const indexHtmlPath = normalize(join(reportDir, "index.html"));
    let reportExists = false;
    
    try {
      await fs.access(indexHtmlPath);
      reportExists = true;
      console.log(`HTML report verified at ${indexHtmlPath}`);
    } catch (error) {
      console.error(`HTML report not found at ${indexHtmlPath}, attempting to create a fallback`);
      
      // Create a basic error report if none exists
      try {
        const errorHtml = `
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Test Execution Report</title>
            <style>
              body { font-family: system-ui, sans-serif; margin: 0; padding: 20px; background-color: #f8f9fc; color: #1e293b; }
              .container { max-width: 800px; margin: 0 auto; background-color: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1); }
              h1 { color: #dc2626; margin-top: 0; }
              h2 { color: #334155; }
              pre { background-color: #f1f5f9; padding: 15px; border-radius: 5px; overflow-x: auto; }
              @media (prefers-color-scheme: dark) {
                body { background-color: #1e1e1e; color: #f1f5f9; }
                .container { background-color: #2d3748; box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3); }
                h2 { color: #cbd5e1; }
                pre { background-color: #1e293b; color: #cbd5e1; }
              }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>Test Execution Report</h1>
              <p class="warning">Test execution completed but no standard report was generated.</p>
              <h2>Command Output</h2>
              <pre>${result.stdout}</pre>
              ${result.stderr ? `<h2>Error Output</h2><pre>${result.stderr}</pre>` : ''}
              <h2>Exit Code</h2>
              <pre>${result.success ? '0 (Success)' : 'Non-zero (Failure)'}</pre>
            </div>
          </body>
        </html>
        `;
        
        await fs.writeFile(indexHtmlPath, errorHtml);
        reportExists = true;
        console.log(`Created fallback HTML report at ${indexHtmlPath}`);
      } catch (reportError) {
        console.error(`Failed to create fallback report: ${reportError}`);
      }
    }
    
    // Generate a combined report for all tests
    const testResults = testScripts.map(({ id, name }) => {
      const testName = name || id;
      // Simple check based on stdout to determine if a test passed or failed
      const testWasRun = result.stdout.includes(`${id}.spec.js`);
      const testFailed = result.stdout.includes(`fail`) && result.stdout.includes(`${id}.spec.js`);
      const testPassed = testWasRun && !testFailed;
      
      return {
        testId: id,
        name: testName,
        success: testPassed,
        error: testFailed ? `Test ${testName} failed during execution` : null
      };
    });
    
    // Create a summary report file
    const summaryReportPath = normalize(join(reportDir, "job-summary.json"));
    const summaryReport = {
      jobId,
      success: result.success,
      timestamp: new Date().toISOString(),
      testCount: testScripts.length,
      successCount: testResults.filter(r => r.success).length,
      failCount: testResults.filter(r => !r.success).length,
      results: testResults
    };
    
    await fs.writeFile(summaryReportPath, JSON.stringify(summaryReport, null, 2));
    console.log(`Created summary report at ${summaryReportPath}`);
    
    // Store report metadata in the database
    try {
      console.log(`Storing report metadata for job ${jobId}`);
      const reportPathForDb = `/jobs/${jobId}/report`;
      await storeReportMetadata(jobId, 'job', reportPathForDb);
    } catch (metadataError) {
      console.error(`Failed to store report metadata: ${metadataError}`);
    }
    
    return {
      ...result,
      reportUrl: externalReportUrl,
      jobId
    };
  } catch (error) {
    console.error(`Error executing tests for job ${jobId}:`, error);
    
    // Create a fallback error report
    try {
      const errorReportPath = normalize(join(reportDir, "index.html"));
      await createErrorReport(
        errorReportPath,
        error instanceof Error ? error.message : String(error),
        "",
        error instanceof Error && error.stack ? error.stack : String(error)
      );
      console.log(`Created error report at ${errorReportPath}`);
      
      // Store report metadata even for failed executions
      try {
        console.log(`Storing error report metadata for job ${jobId}`);
        const reportPathForDb = `/jobs/${jobId}/report`;
        await storeReportMetadata(jobId, 'job', reportPathForDb);
      } catch (metadataError) {
        console.error(`Failed to store error report metadata: ${metadataError}`);
      }
    } catch (reportError) {
      console.error(`Failed to create error report:`, reportError);
    }
    
    return {
      success: false,
      stdout: "",
      stderr: error instanceof Error && error.stack ? error.stack : undefined,
      error: error instanceof Error ? error.message : String(error),
      reportUrl: toUrlPath(`/api/test-results/jobs/${jobId}/report/index.html`),
      jobId
    };
  }
}

// Helper to execute a script
async function executeScript(scriptPath: string): Promise<any> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    
    const childProcess = execFile('node', [scriptPath], {
      timeout: 30000 // 30 second timeout
    }, (error, stdoutResult, stderrResult) => {
      stdout = stdoutResult;
      stderr = stderrResult;
      
      resolve({
        success: !error,
        stdout,
        stderr,
        error: error ? error.message : null
      });
    });
    
    childProcess.on('error', (err) => {
      console.error(`Error executing script ${scriptPath}:`, err);
    });
  });
}

/**
 * Internal helper to run the actual tests for a job, generate report, and handle S3 upload.
 * This is called by the job worker.
 */
async function _runJobTests(
  runId: string,
  testScripts: TestScript[],
  jobTestsDir: string,
  reportDir: string,
  testFilePaths: string[]
): Promise<TestExecutionResult> {
  console.log(`Worker executing tests for job ${runId}`);

  // Execute tests using the shared configuration
  const result = await executeMultipleTestFilesWithGlobalConfig(
    runId,
    testFilePaths,
    reportDir,
    jobTestsDir
  );

  // Parse the results for each test based on stdout analysis (this might need refinement)
  const individualResults = testScripts.map(({ id, name }) => {
    const testName = name || id;
    const testFilename = `${id}.spec.js`;
    
    // Basic check based on stdout - consider enhancing this if possible (e.g., parsing JUnit report)
    const testWasRun = result.stdout.includes(testFilename);
    // A simple heuristic: if the filename appears and "failed" appears later in the output for that context
    const testFailed = result.stdout.includes(`fail`) && result.stdout.includes(testFilename); 
    const testPassed = testWasRun && !testFailed;

    // Update the test status in the shared status map
    if (testStatusMapRef) {
      testStatusMapRef.set(id, {
        testId: id,
        status: "completed",
        success: testPassed,
        error: testFailed ? `Test ${testName} failed during execution (check report)` : null,
        reportUrl: toUrlPath(`/api/test-results/jobs/${runId}/report/index.html`)
      });
    }

    return {
      testId: id,
      success: testPassed,
      error: testFailed ? `Test ${testName} failed during execution (check report)` : null,
      reportUrl: toUrlPath(`/api/test-results/jobs/${runId}/report/index.html`), // Use job report URL
    };
  });

  // Overall success is true ONLY if the execution succeeded AND all individual tests passed
  const overallSuccess = result.success && individualResults.every((res) => res.success);

  // Update the overall job status
  if (testStatusMapRef) {
    testStatusMapRef.set(runId, {
      testId: runId,
      status: "completed",
      success: overallSuccess,
      error: overallSuccess ? null : (result.error || "One or more tests failed"),
      reportUrl: toUrlPath(`/api/test-results/jobs/${runId}/report/index.html`)
    });
  }

  // Upload results to S3 only on overall success
  if (overallSuccess) {
      try {
          console.log(`Uploading test results for job ${runId} to S3`);
          await uploadDirectory(reportDir, `test-results/jobs/${runId}/report`);
          console.log(`Successfully uploaded results for ${runId} to S3`);
      } catch (uploadError) {
          console.error(`Error uploading test results to S3:`, uploadError);
          // Potentially mark as failed or log error? For now, just log.
      }
  } else {
      console.log(`Skipping S3 upload for failed job ${runId}`);
  }

  // Store report metadata regardless of success (report might contain errors)
  try {
      console.log(`Storing report metadata for job ${runId}`);
      const urlPath = `/api/test-results/jobs/${runId}/report/index.html`.split('/api/test-results')[1];
      const reportPathParts = urlPath.split('/');
      const finalReportDir = reportPathParts.slice(0, reportPathParts.length - 1).join('/').split('?')[0];
      await storeReportMetadata(runId, 'job', finalReportDir);
  } catch (metadataError) {
      console.error(`Error storing report metadata for job ${runId}:`, metadataError);
  }

  const finalResult: TestExecutionResult = {
    jobId: runId,
    success: overallSuccess, // Use the refined overall success status
    error: result.error, // Error from the playwright execution process itself
    reportUrl: toUrlPath(`/api/test-results/jobs/${runId}/report/index.html`),
    results: individualResults,
    timestamp: new Date().toISOString(),
    stdout: result.stdout,
    stderr: result.stderr,
  };

  console.log(`Worker finished job ${runId} with overall success: ${overallSuccess}`);
  return finalResult;
}

/**
 * Execute multiple test files with global config
 * @param runId - The ID of the test run
 * @param testFilePaths - Array of paths to test files
 * @param reportDir - Directory to store reports
 * @param testsDir - Directory containing the test files
 * @returns Object containing success status, stdout, stderr, and error if any
 */
export async function executeMultipleTestFilesWithGlobalConfig(
  runId: string,
  testFilePaths: string[],
  reportDir: string,
  testsDir: string
): Promise<{
  success: boolean;
  stdout: string;
  stderr?: string;
  error?: string;
}> {
  // Check if we have any test files
  if (!testFilePaths || testFilePaths.length === 0) {
    return {
      success: false,
      stdout: "No test files provided",
      error: "No test files provided to execute"
    };
  }
  
  console.log(`Executing ${testFilePaths.length} test files for run ${runId}`);
  console.log(`Report directory: ${reportDir}`);
  console.log(`Tests directory: ${testsDir}`);
  
  // Make sure the report directory exists
  await fs.mkdir(reportDir, { recursive: true });
  
  // Set up environment variables for this test run
  const env = {
    ...process.env,
    TEST_RUN_ID: runId,
    PLAYWRIGHT_HTML_REPORT: reportDir,
    // Add any other environment variables needed for the tests
  };
  
  // Construct the command to execute the tests
  const args = [
    "npx", "playwright", "test",
    "--reporter=html,line",
    `--output=${reportDir}`,
    ...testFilePaths
  ];
  
  const command = args.join(" ");
  console.log(`Executing command: ${command}`);
  
  return new Promise((resolve) => {
    const childProcess = spawn(args[0], args.slice(1), {
      env,
      shell: true,
      cwd: process.cwd()
    });
    
    let stdout = "";
    let stderr = "";
    
    childProcess.stdout.on("data", (data) => {
      const chunk = data.toString();
      stdout += chunk;
      console.log(`[Test output] ${chunk}`);
    });
    
    childProcess.stderr.on("data", (data) => {
      const chunk = data.toString();
      stderr += chunk;
      console.error(`[Test error] ${chunk}`);
    });
    
    childProcess.on("error", (error) => {
      console.error(`Error executing Playwright tests: ${error.message}`);
      resolve({
        success: false,
        stdout,
        stderr,
        error: error.message
      });
    });
    
    childProcess.on("close", async (code) => {
      console.log(`Playwright process exited with code ${code}`);
      
      // Check if the HTML report was generated
      const indexHtmlPath = normalize(join(reportDir, "index.html"));
      let reportExists = false;
      
      try {
        await fs.access(indexHtmlPath);
        reportExists = true;
        console.log(`HTML report generated at ${indexHtmlPath}`);
      } catch (error) {
        console.error(`HTML report not found at ${indexHtmlPath}`);
        
        // Create a basic error report if none exists
        try {
          const errorHtml = `
          <!DOCTYPE html>
          <html lang="en">
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Test Execution Report</title>
              <style>
                body { font-family: system-ui, sans-serif; margin: 0; padding: 20px; background-color: #f8f9fc; color: #1e293b; }
                .container { max-width: 800px; margin: 0 auto; background-color: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1); }
                h1 { color: #dc2626; margin-top: 0; }
                h2 { color: #334155; }
                pre { background-color: #f1f5f9; padding: 15px; border-radius: 5px; overflow-x: auto; }
                @media (prefers-color-scheme: dark) {
                  body { background-color: #1e1e1e; color: #f1f5f9; }
                  .container { background-color: #2d3748; box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3); }
                  h2 { color: #cbd5e1; }
                  pre { background-color: #1e293b; color: #cbd5e1; }
                }
              </style>
            </head>
            <body>
              <div class="container">
                <h1>Test Execution Report</h1>
                <p class="warning">Playwright did not generate a standard HTML report.</p>
                <h2>Command Output</h2>
                <pre>${stdout}</pre>
                ${stderr ? `<h2>Error Output</h2><pre>${stderr}</pre>` : ''}
                <h2>Exit Code</h2>
                <pre>${code}</pre>
              </div>
            </body>
          </html>
          `;
          
          await fs.writeFile(indexHtmlPath, errorHtml);
          reportExists = true;
          console.log(`Created fallback HTML report at ${indexHtmlPath}`);
        } catch (reportError) {
          console.error(`Failed to create fallback report: ${reportError}`);
        }
      }
      
      // Store report metadata
      try {
        console.log(`Storing report metadata for ${runId}`);
        const reportPathForDb = `/jobs/${runId}/report`;
        await storeReportMetadata(runId, 'job', reportPathForDb);
      } catch (metadataError) {
        console.error(`Failed to store report metadata: ${metadataError}`);
      }
      
      resolve({
        success: code === 0,
        stdout,
        stderr: stderr || undefined,
        error: code !== 0 ? `Playwright exited with code ${code}` : undefined
      });
    });
  });
}

// Clear old test status entries periodically
setInterval(() => {
  const now = Date.now();
  const expiredJobIds = [];
  for (const [testId, timestamp] of recentTestIds.entries()) {
    if (now - timestamp > CLEANUP_THRESHOLD) {
      expiredJobIds.push(testId);
    }
  }
  // Remove expired job IDs 
  for (const testId of expiredJobIds) {
    recentTestIds.delete(testId);
    if (!activeTestIds.has(testId)) {
      testStatusMap.delete(testId);
    }
  }
}, CLEANUP_INTERVAL);

// Add a cleanup function to remove test status after execution
export function cleanupTest(testId: string) {
  // Remove the test from active tracking
  activeTestIds.delete(testId);
  
  // Add to the recent tests list to delay complete removal
  recentTestIds.set(testId, Date.now());
  
  console.log(`Test ${testId} marked for cleanup`);
  
  // Don't immediately remove from the test status map
  // It will be cleaned up by the interval if not accessed again
}

