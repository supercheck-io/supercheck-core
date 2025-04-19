// Import child_process as a whole module to avoid Next.js dynamic import issues
import childProcess from "child_process";
import * as fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { validateCode } from "./code-validation";
import crypto from "crypto";
// Remove async import
// Import S3 storage utilities
import { uploadDirectory } from "./s3-storage";
// Import pg-boss queue functions
import { 
  addTestToQueue, 
  addJobToQueue, 
  waitForJobCompletion, 
  TestExecutionTask, 
  JobExecutionTask,
  setupTestExecutionWorker,
  setupJobExecutionWorker,
  setTestStatusMap,
  TestStatusUpdateMap 
} from "./queue";

const { spawn } = childProcess;
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

// Share the testStatusMap with the queue module
setTestStatusMap(testStatusMap as unknown as TestStatusUpdateMap);

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

// Remove async.queue implementation
// Setup the pg-boss worker for test execution instead
export async function initializeTestWorkers(): Promise<void> {
  console.log('Initializing test and job workers...');
  
  try {
    // Initialize test execution worker with proper error handling
    await setupTestExecutionWorker(MAX_CONCURRENT_TESTS, async (task: TestExecutionTask) => {
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

        console.log(`Test ${task.testId} completed with success: ${result.success}`);
        
        // IMPORTANT: Ensure we return a complete TestResult object
        // This fixes the issue where the result is incomplete
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
        // Log detailed error for debugging
        console.error(`Error in test worker for ${task.testId}:`, error);
        
        // Create a meaningful error message
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // Update the test status to completed with error
        testStatusMap.set(task.testId, {
          testId: task.testId,
          status: "completed",
          success: false,
          error: errorMessage,
          reportUrl: task.testId ? toUrlPath(`/api/test-results/tests/${task.testId}/report/index.html`) : null,
        });
        
        // Construct error result object
        const errorResult: TestResult = {
          success: false,
          error: errorMessage,
          testId: task.testId,
          stdout: "",
          stderr: errorMessage,
          reportUrl: task.testId ? toUrlPath(`/api/test-results/tests/${task.testId}/report/index.html`) : null
        };
        
        // Return the error result object instead of throwing
        // This allows pg-boss to mark the job as completed instead of failed
        return errorResult;
      }
    });
    
    // Initialize job execution worker with better concurrency
    await setupJobExecutionWorker(
      Math.max(1, Math.floor(MAX_CONCURRENT_TESTS / 2)), // Use fewer workers for job execution
      async (task: JobExecutionTask) => {
        try {
          console.log(`Worker processing job execution for ${task.jobId}`);
          
          // Execute the tests
          const result = await executeMultipleTests(task.testScripts, task.jobId);
          
          // Upload results to S3 after job completes
          try {
            console.log(`Uploading test results for job ${task.jobId} to S3`);
            const testResultsDir = normalize(getResultsPath(task.jobId, true));
            const reportDir = normalize(join(testResultsDir, "report"));
            
            await uploadDirectory(reportDir, `test-results/jobs/${task.jobId}/report`);
            console.log(`Successfully uploaded results for ${task.jobId} to S3`);
          } catch (uploadError) {
            console.error(`Error uploading results to S3:`, uploadError);
          }
          
          return result;
        } catch (error) {
          // Log detailed error for debugging
          console.error(`Error in job worker for ${task.jobId}:`, error);
          
          // Create a meaningful error message
          const errorMessage = error instanceof Error ? error.message : String(error);
          
          // Construct error result
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
    
    console.log('Test and job workers initialized successfully');
  } catch (error) {
    console.error('Failed to initialize workers:', error);
    throw error;
  }
}

// Call this on application startup - use more robust approach to only init once
let workersInitialized = false;
const initializeWorkers = async () => {
  if (!workersInitialized) {
    try {
      workersInitialized = true; // Set flag first to prevent multiple initializations
      await initializeTestWorkers();
      console.log('Workers initialization complete');
    } catch (err) {
      workersInitialized = false; // Reset flag on error so we can retry
      console.error('Worker initialization failed:', err);
      // Try again after a delay
      setTimeout(initializeWorkers, 5000);
    }
  }
};

// Start initialization immediately
initializeWorkers().catch(err => {
  console.error('Initial worker setup failed:', err);
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
      const testResultsDir = normalize(getResultsPath(testId));
      const reportDir = normalize(join(testResultsDir, "report"));

      // Ensure the directory exists
      await fs.mkdir(dirname(join(reportDir, "index.html")), {
        recursive: true,
      });
      await fs.writeFile(join(reportDir, "index.html"), errorHtml);

      return {
        success: false,
        error: validationResult.error || null,
        reportUrl: toUrlPath(`/api/test-results/tests/${testId}/report/index.html`),
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

    // Use pg-boss queue instead of async queue
    const task: TestExecutionTask = {
      testId,
      testPath
    };
    
    try {
      // Add the test to the queue
      const queuedJobId = await addTestToQueue(task);
      console.log(`Test ${testId} queued successfully with job ID: ${queuedJobId}`);
      
      // Wait for the job to complete
      try {
        const result = await waitForJobCompletion<TestResult>(testId, TEST_EXECUTION_TIMEOUT_MS);
        
        // Ensure result is properly formatted
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
        
        // Throw to trigger the catch block
        throw waitError;
      }
    } catch (queueError) {
      console.error(`Error with test queue for ${testId}:`, queueError);
      
      // Create an error report for queue failure 
      const errorMessage = queueError instanceof Error ? queueError.message : String(queueError);
      
      return {
        success: false,
        error: errorMessage,
        reportUrl: toUrlPath(`/api/test-results/tests/${testId}/report/index.html`),
        testId,
        stdout: "",
        stderr: `Queue error: ${errorMessage}`,
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
      const testResultsDir = normalize(getResultsPath(testId));
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
        reportUrl: toUrlPath(`/api/test-results/tests/${testId}/report/index.html`),
      });
    } catch (reportError) {
      console.error("Error creating error report:", reportError);
    }

    return {
      success: false,
      error: errorMessage,
      reportUrl: toUrlPath(`/api/test-results/tests/${testId}/report/index.html`),
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

    // Create run-specific report directory using runId and the jobs subfolder
    const testResultsDir = normalize(getResultsPath(runId, true)); // Using helper with isJob=true
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

    // Create a loading indicator report
    const loadingHtml = `<!DOCTYPE html>
<html>
  <head>
    <title>Job Running - ${runId}</title>
    <style>
      body { font-family: system-ui; background-color: #f8f8f8; color: #333; margin: 0; padding: 20px; }
      .container { max-width: 800px; margin: 0 auto; background-color: white; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); padding: 20px; }
      h1 { color: #2563eb; margin-top: 0; }
      .loading { display: flex; align-items: center; margin: 20px 0; }
      .spinner { border: 4px solid rgba(0, 0, 0, 0.1); width: 36px; height: 36px; border-radius: 50%; border-left-color: #2563eb; animation: spin 1s linear infinite; margin-right: 15px; }
      @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    </style>
    <script>
      document.addEventListener('DOMContentLoaded', function() {
        // Check status every 3 seconds and reload when complete
        const checkStatus = async () => {
          try {
            const response = await fetch('/api/test-status/${runId}');
            const data = await response.json();
            
            if (data.status === 'completed') {
              window.location.reload();
            } else {
              setTimeout(checkStatus, 3000);
            }
          } catch (e) {
            // If there's an error, try again after 5 seconds
            setTimeout(checkStatus, 5000);
          }
        };
        
        checkStatus();
      });
    </script>
  </head>
  <body>
    <div class="container">
      <h1>Job Execution in Progress</h1>
      <div class="loading"><div class="spinner"></div><div>Running your test job...</div></div>
      <p>Job ID: <code>${runId}</code></p>
      <p>Running ${testScripts.length} test${testScripts.length !== 1 ? 's' : ''}...</p>
    </div>
  </body>
</html>`;

    // Write the loading indicator
    const htmlReportPath = normalize(join(reportDir, "index.html"));
    await fs.writeFile(htmlReportPath, loadingHtml);

    // Update the test status to running
    testStatusMap.set(runId, {
      testId: runId,
      status: "running",
      reportUrl: toUrlPath(`/api/test-results/jobs/${runId}/report/index.html`),
    });

    // Execute the tests directly first if queue fails
    const executeTestsDirectly = async (): Promise<TestExecutionResult> => {
      console.log(`Executing job ${runId} directly due to queue error`);
      
      // Execute tests directly
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
        
        // Check if the test was mentioned in the output
        const testWasRun = result.stdout.includes(testFilename);
        const testFailed = result.stdout.includes(`${testFilename}`) && 
                            result.stdout.includes("failed");
        const testPassed = !testFailed && testWasRun;
        
        return {
          testId: id,
          success: testPassed,
          error: testFailed ? `Test ${testName} failed during execution` : null,
          reportUrl: toUrlPath(`/api/test-results/jobs/${runId}/report/index.html`),
        };
      });
      
      // Overall success is true if all individual tests succeeded
      const overallSuccess = individualResults.every((res) => res.success);
      
      // Upload results to S3
      try {
        console.log(`Uploading test results for job ${runId} to S3`);
        await uploadDirectory(reportDir, `test-results/jobs/${runId}/report`);
      } catch (uploadError) {
        console.error(`Error uploading test results to S3:`, uploadError);
      }
      
      return {
        jobId: runId,
        success: overallSuccess,
        error: result.error,
        reportUrl: toUrlPath(`/api/test-results/jobs/${runId}/report/index.html`),
        results: individualResults,
        timestamp: new Date().toISOString(),
        stdout: result.stdout,
        stderr: result.stderr,
      };
    };

    try {
      // Create a job task for pg-boss queue
      const jobTask: JobExecutionTask = {
        jobId: runId,
        testScripts
      };
      
      // Add the job to the queue
      const queuedJobId = await addJobToQueue(jobTask);
      console.log(`Job ${runId} queued successfully with ID: ${queuedJobId}`);
      
      try {
        // Wait for the job to complete with a timeout
        return await waitForJobCompletion<TestExecutionResult>(runId, TEST_EXECUTION_TIMEOUT_MS * 2);
      } catch (waitError) {
        console.error(`Error waiting for job ${runId} to complete:`, waitError);
        console.log(`Falling back to direct execution for job ${runId}`);
        
        // If waiting for the queued job fails, try executing directly
        return await executeTestsDirectly();
      }
    } catch (queueError) {
      console.error(`Error queuing job ${runId}:`, queueError);
      
      // Fall back to direct execution if queuing fails
      return await executeTestsDirectly();
    }
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

      
      // Determine the command to run based on the OS
      const isWindows = process.platform === "win32";
      const command = isWindows ? "npx.cmd" : "npx";

      // Build the arguments for the command - remove --output flag
      const args = [
        "playwright",
        "test",
        ...testFilePaths.map((path) => toCLIPath(path)),
        "--config=playwright.config.mjs"
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
          reportUrl: toUrlPath(`/api/test-results/jobs/${testId}/report/index.html`),
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
            reportUrl: toUrlPath(`/api/test-results/jobs/${testId}/report/index.html`),
            stdout,
            stderr,
          });
        } else {
          console.log(`Test ${testId} completed successfully`);
          resolve({
            testId,
            success: true,
            error: null,
            reportUrl: toUrlPath(`/api/test-results/jobs/${testId}/report/index.html`),
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
