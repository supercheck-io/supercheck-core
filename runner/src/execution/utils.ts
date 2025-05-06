import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import { execSync, exec } from 'child_process';

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
    ['html', { open: 'never', outputFolder: 'report' }], // Generate HTML report
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
const playwrightReportDir = path.join(runTempDir, 'report'); // Default Playwright HTML report output

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
      const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      execSync(\`\${npmCmd} install --no-save --legacy-peer-deps @playwright/test\`, { cwd: runTempDir, stdio: 'inherit' });
      log('@playwright/test installed successfully.');
    } catch (installError) {
      logError(\`Failed to install @playwright/test: \${installError.message}\`);
      throw installError; // Propagate error
    }

    // 2. Run Playwright tests using npx
    log('Running Playwright tests with npx...');
    await new Promise((resolve) => { // Removed reject as we handle exit code
        const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
        const cmd = \`\${npxCmd} playwright test \${testId}.spec.js --config=playwright.config.js\`;
        log(\`Executing: \${cmd}\`);
        const testProcess = exec(cmd, { 
          cwd: runTempDir,
          shell: process.platform === 'win32', // Use shell on Windows
        }, (error, stdout, stderr) => {
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

/**
 * Ensures the generated test has proper trace configuration
 * This helps prevent issues with trace file paths in parallel job executions
 */
export function ensureProperTraceConfiguration(testScript: string, testId?: string): string {
    // Use a unique trace directory based on testId to prevent conflicts in parallel execution
    const traceDir = testId ? 
        `./trace-${testId.substr(0, 8)}` : 
        `./trace-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
    
    // Add proper trace configuration if it doesn't exist
    if (!testScript.includes('context.tracing.start')) {
        // Look for browser setup pattern
        const browserSetupRegex = /(const\s+browser\s*=\s*await\s+chromium\.launch[\s\S]*?;)/;
        if (browserSetupRegex.test(testScript)) {
            return testScript.replace(
                browserSetupRegex,
                `$1\n\n  // Ensure traces are saved to a unique location to prevent conflicts during parallel execution\n  const context = await browser.newContext();\n  await context.tracing.start({ screenshots: true, snapshots: true, dir: '${traceDir}' });\n`
            );
        }
    }
    
    // If script already includes tracing but without a custom directory, add the directory
    if (testScript.includes('context.tracing.start') && !testScript.includes('dir:')) {
        return testScript.replace(
            /(await\s+context\.tracing\.start\s*\(\s*\{[^}]*)\}/,
            `$1, dir: '${traceDir}'}`
        );
    }
    
    return testScript;
} 