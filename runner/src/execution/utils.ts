import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';

const { join, normalize, sep, dirname } = path;

// Helper function to check if running on Windows
export const isWindows = process.platform === "win32";

/**
 * Converts a path to a properly formatted CLI path based on the operating system.
 * Handles escaping special characters and spaces.
 */
export function toCLIPath(inputPath: string): string {
    // Get absolute path
    const absolutePath = path.isAbsolute(inputPath) 
        ? inputPath 
        : path.resolve(process.cwd(), inputPath);
    
    // Return the properly formatted path for CLI usage
    return absolutePath.replace(/([\\\\])/g, '\\\\$1');
}

// Generates a temporary directory path for a given execution ID
export function getTemporaryRunPath(runId: string): string {
  // Use os.tmpdir() for a system-appropriate temporary directory
  const basePath = path.join(os.tmpdir(), 'supertest-runs');
  return path.join(basePath, runId);
}

// Note: getResultsPath from the original project is adapted into getTemporaryRunPath
// as the worker service doesn't have a 'public' directory.
// Results (like test files, reports) will be stored here temporarily before S3 upload.

// Note: toUrlPath from the original project is removed as URLs will point to S3.
// The S3 service should provide the final URL, or the DB service should store it.

// Gets the content type based on file extension (simple version)
export function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html':
      return 'text/html';
    case '.css':
      return 'text/css';
    case '.js':
      return 'application/javascript';
    case '.json':
      return 'application/json';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.svg':
      return 'image/svg+xml';
    case '.txt':
      return 'text/plain';
    default:
      return 'application/octet-stream';
  }
}

// --- Runner Script Template ---
// This template defines the structure of the self-contained Node.js script
// that will execute the user's Playwright test. Placeholders like %%...%%
// will be replaced by createDiscoverableTestFile.

const RUNNER_TEMPLATE = `
const { chromium, expect } = require('playwright/test'); // Use expect from playwright/test
const fs = require('fs');
const path = require('path');

// --- Configuration ---
const testName = "%%TEST_NAME%%";
const runTempDir = process.env.RUN_TEMP_DIR || __dirname;
const reportDir = path.join(runTempDir, 'report');

// --- Setup ---
fs.mkdirSync(reportDir, { recursive: true });
const results = [];
let browser;
let context;
let page;
const output = [];
const screenshots = [];

// --- Helper Functions ---
const log = (message) => {
  console.log(message);
  output.push(String(message)); // Ensure message is string
};

const takeScreenshot = async (title) => {
  if (!page) {
    log('Cannot take screenshot: page is not initialized.');
    return null;
  }
  try {
    const screenshotFileName = \`screenshot-\${Date.now()}-\${Math.floor(Math.random() * 1000)}.png\`;
    const screenshotPath = path.join(reportDir, screenshotFileName);
    await page.screenshot({ path: screenshotPath });
    const screenshot = { 
      path: screenshotPath, 
      title: title || 'Screenshot',
      filename: screenshotFileName // Keep filename for potential report linking
    };
    screenshots.push(screenshot);
    log(\`Screenshot taken: \${title || 'Untitled'} (\${screenshotFileName})\`);
    return screenshot;
  } catch (screenshotError) {
    log(\`Failed to take screenshot (\${title || 'Untitled'}): \${screenshotError.message}\`);
    return null;
  }
};

const createReport = (reportResults) => {
  const htmlContent = \`
<!DOCTYPE html>
<html>
<head>
  <title>Test Results: \${testName}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      margin: 0;
      padding: 40px;
      font-size: 14px;
      color: #333;
      background-color: #fff;
      transition: background-color 0.3s, color 0.3s;
    }
    
    @media (prefers-color-scheme: dark) {
      body {
        color: #d4d4d4;
        background-color: #1e1e1e;
      }
      h1 {
        border-color: #444;
      }
      .test-result {
        border-color: #444;
      }
      .success {
        background-color: rgba(76, 175, 80, 0.15);
        border-left-color: #4CAF50;
      }
      .failure {
        background-color: rgba(244, 67, 54, 0.15);
        border-left-color: #f44336;
      }
      .test-meta {
        color: #aaa;
      }
      .error-message {
        color: #ff6b6b;
      }
      pre {
        background-color: #2d2d2d;
        color: #d4d4d4;
        border-color: #444;
      }
      .screenshots-section {
        border-color: #444;
      }
      .screenshot {
        border-color: #444;
      }
    }
    
    h1 {
      border-bottom: 1px solid #ccc;
      padding-bottom: 10px;
    }
    .test-result {
      margin-bottom: 20px;
      padding: 15px;
      border-radius: 5px;
      border: 1px solid #ddd;
    }
    .success {
      background-color: #e9f7ef;
      border-left: 5px solid #4CAF50;
    }
    .failure {
      background-color: #fdeded;
      border-left: 5px solid #f44336;
    }
    .test-result h3 {
      margin-top: 0;
      margin-bottom: 10px;
    }
    .test-meta {
      font-size: 0.9em;
      color: #666;
      margin-bottom: 10px;
    }
    .error-message {
      color: #f44336;
      font-weight: bold;
      margin-bottom: 10px;
    }
    pre {
      background-color: #f8f9fa;
      padding: 10px;
      border-radius: 4px;
      overflow-x: auto;
      border: 1px solid #eee;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    .screenshots-section {
      margin-top: 15px;
      padding-top: 10px;
      border-top: 1px dashed #eee;
    }
    .screenshots-section h4 {
      margin-bottom: 5px;
      font-size: 1.1em;
    }
    .screenshot-container {
      margin-bottom: 10px;
      text-align: left;
    }
    .screenshot-title {
      font-weight: bold;
      margin-bottom: 5px;
      display: block;
    }
    .screenshot {
      max-width: 80%;
      height: auto;
      border: 1px solid #ccc;
      display: block;
      margin-top: 5px;
    }
  </style>
</head>
<body>
  <h1>Test Results</h1>
  <div class="test-meta">Run ID: \${process.env.TEST_ID || 'N/A'} | Timestamp: \${new Date().toISOString()}</div>
  <div id="results">
    \${reportResults.map(r => \`
      <div class="test-result \${r.success ? 'success' : 'failure'}">
        <h3>\${r.name} - \${r.success ? 'Passed' : 'Failed'}</h3>
        \${r.error ? \`<div class="error-message">Error: \${r.error}</div>\` : ''}
        <h4>Console Output:</h4>
        <pre>\${r.output || 'No output logged.'}</pre>
        \${r.screenshots && r.screenshots.length > 0 ? \`
          <div class="screenshots-section">
            <h4>Screenshots:</h4>
            \${r.screenshots.map(s => \`
              <div class="screenshot-container">
                <span class="screenshot-title">\${s.title || 'Screenshot'}</span>
                <img class="screenshot" src="\${path.basename(s.path)}" alt="\${s.title || 'Screenshot'}" />
              </div>
            \`).join('')}
          </div>
        \` : ''}
      </div>
    \`).join('')}
  </div>
</body>
</html>
  \`;
  
  try {
      fs.writeFileSync(path.join(reportDir, 'index.html'), htmlContent);
      // Also write raw results data
      fs.writeFileSync(path.join(reportDir, '.last-run.json'), JSON.stringify({results: reportResults, timestamp: new Date().toISOString()}, null, 2));
      log('HTML Report generated successfully.');
  } catch (reportError) {
      log(\`Error generating report: \${reportError.message}\`);
  }
};

// --- Main Execution Logic ---
(async () => {
  let overallSuccess = false;
  let executionError = null;

  try {
    log('Starting Playwright browser...');
    browser = await chromium.launch({ headless: true });
    log('Browser launched.');
    context = await browser.newContext({ 
        recordVideo: { dir: reportDir, size: { width: 1280, height: 720 } }, // Record video to the report directory
        // viewport: { width: 1280, height: 720 } // Optional: Set viewport size
    });
    log('Browser context created with video recording enabled.');

    // Start tracing
    await context.tracing.start({
        title: testName, // Use test name for trace title
        screenshots: true, 
        snapshots: true, 
        sources: true // Include source code
    });
    log('Playwright tracing started.');

    page = await context.newPage();
    log('New page created.');

    // Set up basic page event handlers
    page.on('console', msg => {
      log(\`BROWSER CONSOLE: [\${msg.type()}] \${msg.text()}\`);
    });
    page.on('pageerror', error => {
      log(\`PAGE ERROR: \${error.message}\n\${error.stack}\`);
      // Consider failing the test on page errors
      // executionError = executionError || new Error(\`Page error: \${error.message}\`); 
    });
    log('Page event handlers registered.');

    // Expose helper functions to the test code if needed (less common now)
    // await page.exposeFunction('takeScreenshot', takeScreenshot);

    log(\`Starting test: \${testName}\`);

    // --- Execute User Script ---
    try {
      %%SCRIPT_CONTENT%% // This will define tests and populate __testsToRun if adapter is used

      %%RUN_COLLECTED_TESTS%% // Run the collected tests here

      // If execution reaches here without errors from the user script
      log('Test script finished execution.');
      overallSuccess = true; // Mark success if no error thrown by script

    } catch (testScriptError) {
      log(\`Test script failed: \${testScriptError.message}\`);
      console.error(testScriptError); // Log full error to stderr
      executionError = testScriptError; // Capture error
      overallSuccess = false;
      await takeScreenshot('Error state'); // Take screenshot on error
    }
    // --- End User Script ---

    if (overallSuccess) {
      await takeScreenshot('Final state');
      log('Test completed successfully.');
    } else {
       log(\`Test finished with error(s).\`);
    }

  } catch (setupError) {
    log(\`Error during test setup or teardown: \${setupError.message}\`);
    console.error(setupError); // Log full error to stderr
    executionError = setupError;
    overallSuccess = false;
  } finally {
    log('Starting cleanup...');

    // Stop tracing and save the trace file
    const tracePath = path.join(reportDir, 'trace.zip');
    try {
      if (context) { // Ensure context exists before stopping trace
        await context.tracing.stop({ path: tracePath });
        log(\`Playwright tracing stopped. Trace file saved to: \${tracePath}\`);\n      } else {\n        log(\'Skipping trace stop: context was not initialized.\');\n      }\n    } catch(traceError) {\n        log(\`Error stopping Playwright trace: \${traceError.message}\`);\n    }\n

    // Add final result entry
    results.push({
      name: testName,
      success: overallSuccess,
      output: output.join('\\n'),
      error: executionError ? String(executionError.message || executionError) : null,
      screenshots: screenshots
    });

    // Close browser
    if (browser) {
      log('Closing browser...');
      try {
        await browser.close();
        log('Browser closed.');
      } catch (closeError) {
        log(\`Error closing browser: \${closeError.message}\`);
      }
    } else {
        log('Browser was not initialized, skipping close.');
    }
    
    // Generate the report
    createReport(results);
    
    log(\`Exiting process. Overall success: \${overallSuccess}\`);
    // Exit with success/failure code
    process.exit(overallSuccess ? 0 : 1);
  }
})();
`;

/**
 * Creates a self-running Playwright script that doesn't rely on the test runner.
 * @param scriptContent The test script content
 * @param testId Unique identifier for the test
 * @param name Optional display name for the test
 * @returns Object with the file path and prepared content
 */
export async function createDiscoverableTestFile(
    scriptContent: string,
    testId: string,
    tempDir: string,
    name?: string
): Promise<{ filePath: string, content: string }> {
    await fs.mkdir(tempDir, { recursive: true });

    const safeFileName = `run.js`; // This will be the wrapper script
    const runnerFilePath = path.join(tempDir, safeFileName);
    const testName = name || `Test ${testId}`;
    // Escape backticks and backslashes in the test name for safe insertion
    const safeTestName = testName.replace(/\\/g, '\\\\').replace(/`/g, '\\`');

    // Create a proper playwright config in the temp directory
    const playwrightConfigPath = path.join(tempDir, 'playwright.config.js');
    const playwrightConfig = `
// playwright.config.js
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './', // Look for tests in the current directory
  fullyParallel: true, // Run tests in parallel
  forbidOnly: !!process.env.CI, // Fail the build on CI if you accidentally left test.only in the source code.
  retries: process.env.CI ? 2 : 0, // Retry on CI only.
  workers: process.env.CI ? 1 : undefined, // Opt out of parallel tests on CI.
  outputDir: './test-results', // Folder for test artifacts like screenshots, videos, traces, etc.
  reporter: [
    ['html', { open: 'never', outputFolder: 'playwright-report' }], // Generate HTML report
    ['list'] // Use list reporter in console
  ],
  use: {
    headless: true, // Run tests headless
    // Always record trace, video, and screenshots for playground debugging
    trace: 'on', 
    video: 'on', 
    screenshot: 'on',
  },
});
`;
    await fs.writeFile(playwrightConfigPath, playwrightConfig);

    // Create the actual test file (e.g., test.spec.js)
    const playwrightTestFile = path.join(tempDir, `${testId}.spec.js`);

    // Prepare the script content for the test file
    let scriptForRunner = scriptContent;
    // Ensure require('@playwright/test') is present if imports were used or if test/expect are used directly
    const usesPlaywrightTest = scriptContent.includes('@playwright/test');
    const requiresPlaywrightTest = scriptContent.includes('require("@playwright/test")') || scriptContent.includes("require('@playwright/test')");

    if (usesPlaywrightTest && !requiresPlaywrightTest) {
         // Add require if import was used but require wasn't
         scriptForRunner = `const { test, expect } = require('@playwright/test');\n${scriptContent}`;
         // Remove the ES6 import statement as we added require
         scriptForRunner = scriptForRunner.replace(/import\s+{[^}]*}\s+from\s+['"]@playwright\/test['"];?/g, '');
    } else if (!usesPlaywrightTest && !requiresPlaywrightTest && (scriptContent.includes('test(') || scriptContent.includes('expect('))) {
         // If no import/require detected, but test() or expect() seem to be used, add the require statement
         // This is a fallback, assuming the user might have omitted the import/require
         scriptForRunner = `const { test, expect } = require('@playwright/test');\n${scriptContent}`;
    }

    // Escape backticks and backslashes for interpolation into the final file content
    const safeScriptForRunner = scriptForRunner.replace(/\\/g, '\\\\').replace(/`/g, '\\`');

    // Write the user's script (potentially with added require) directly into the spec file
    await fs.writeFile(playwrightTestFile, safeScriptForRunner);
    console.log(`[${testId}] Wrote test file: ${playwrightTestFile}`);
    // console.log(`[${testId}] Test file content:\n${safeScriptForRunner}`); // Uncomment for debugging

    // Create the wrapper script (run.js) that installs playwright and runs the test
    const RUNNER_TEMPLATE = `
const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// --- Configuration ---
const testId = "${testId}";
const runTempDir = process.env.RUN_TEMP_DIR || __dirname;
const reportDir = path.join(runTempDir, 'report'); // Target directory for final report
const playwrightReportDir = path.join(runTempDir, 'playwright-report'); // Default Playwright HTML report output

// --- Helper Functions ---
const log = (message) => console.log(\`[\${testId}] \${message}\`);
const logError = (message) => console.error(\`[\${testId}] \${message}\`);

const copyDirRecursive = (src, dest) => {
    if (!fs.existsSync(src)) {
        logError(\`Source directory does not exist: \${src}\`);
        return;
    }
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDirRecursive(srcPath, destPath);
        } else {
            try {
              fs.copyFileSync(srcPath, destPath);
            } catch (copyErr) {
              logError(\`Failed to copy file \${srcPath} to \${destPath}: \${copyErr.message}\`);
            }
        }
    }
};

// --- Main Execution Logic ---
(async () => {
  let exitCode = 1; // Default to failure
  try {
    log('Starting test execution wrapper...');
    log(\`Temporary directory: \${runTempDir}\`);

    // 1. Ensure Playwright is installed in the temp directory
    log('Ensuring @playwright/test is installed...');
    try {
      // Use npm install --no-save to avoid modifying package.json/lock files
      // Added --legacy-peer-deps for potentially better compatibility in restricted environments
      execSync('npm install --no-save --legacy-peer-deps @playwright/test', { cwd: runTempDir, stdio: 'inherit' });
      log('@playwright/test installed successfully.');
    } catch (installError) {
      logError(\`Failed to install @playwright/test: \${installError.message}\`);
      throw installError; // Propagate error
    }

    // 2. Run Playwright tests using npx
    log('Running Playwright tests with npx...');
    await new Promise((resolve) => { // Removed reject as we handle exit code
        const cmd = \`npx playwright test \${testId}.spec.js --config=playwright.config.js\`;
        log(\`Executing: \${cmd}\`);
        const testProcess = exec(cmd, { cwd: runTempDir }, (error, stdout, stderr) => {
            log('--- Playwright STDOUT ---');
            if (stdout) log(stdout);
            log('--- End Playwright STDOUT ---');

            if (stderr) {
                logError('--- Playwright STDERR ---');
                logError(stderr);
                logError('--- End Playwright STDERR ---');
            }

            if (error) {
                logError(\`Playwright execution finished with error code \${error.code}: \${error.message}\`);
                exitCode = error.code || 1;
            } else {
                log('Playwright execution completed successfully.');
                exitCode = 0; // Success
            }
            resolve(); // Resolve regardless of error to allow report copying
        });
    });

    // 3. Copy the generated Playwright report to the final report directory
    log('Checking for Playwright report...');
    if (fs.existsSync(playwrightReportDir)) {
        log(\`Playwright report found at: \${playwrightReportDir}\`);
        log(\`Copying Playwright report to: \${reportDir}\`);
        try {
            copyDirRecursive(playwrightReportDir, reportDir);
            log('Report copied successfully.');

            // Ensure index.html exists at the root of the final report dir
             if (!fs.existsSync(path.join(reportDir, 'index.html')) && fs.existsSync(path.join(playwrightReportDir, 'index.html'))) {
                 log('Copying index.html to report root...');
                 fs.copyFileSync(path.join(playwrightReportDir, 'index.html'), path.join(reportDir, 'index.html'));
             }

        } catch (copyError) {
            logError(\`Failed to copy report: \${copyError.message}\`);
            // Update exit code if copy fails and test was successful
            if (exitCode === 0) exitCode = 1;
        }
    } else {
        logError(\`Playwright report directory not found at: \${playwrightReportDir}\`);
         // Update exit code if report is missing and test was successful
        if (exitCode === 0) exitCode = 1;
    }

  } catch (error) {
    logError(\`Unhandled error during test execution: \${error.message}\`);
    exitCode = 1;
  } finally {
    log(\`Exiting test wrapper with code \${exitCode}.\`);
    process.exit(exitCode);
  }
})();
`;

    // Write the final runner script
    await fs.writeFile(runnerFilePath, RUNNER_TEMPLATE);

    return { filePath: runnerFilePath, content: RUNNER_TEMPLATE }; // Return the path to the *runner* script
} 