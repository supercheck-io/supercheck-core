import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn, execSync, exec } from 'child_process';
import * as fs from 'fs/promises';
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  cpSync,
  readFileSync,
  rmSync,
} from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { S3Service } from './s3.service';
import { DbService } from './db.service';
import { RedisService } from './redis.service';
import { eq } from 'drizzle-orm';
import * as schema from '../../db/schema';
import {
  TestResult,
  TestExecutionResult,
  TestScript,
  TestExecutionTask,
  JobExecutionTask,
  ReportMetadata,
} from '../interfaces';

// Helper function to check if running on Windows
export const isWindows = process.platform === 'win32';

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
  const basePath = path.join(os.tmpdir(), 'supercheck-runs');
  return path.join(basePath, runId);
}

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
 * Ensures the generated test has proper trace configuration
 * This helps prevent issues with trace file paths in parallel job executions
 */
export function ensureProperTraceConfiguration(
  testScript: string,
  testId?: string,
): string {
  // Use a unique trace directory based on testId to prevent conflicts in parallel execution
  const traceDir = testId
    ? `./trace-${testId.substr(0, 8)}`
    : `./trace-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;

  // Add proper trace configuration if it doesn't exist
  if (!testScript.includes('context.tracing.start')) {
    // Look for browser setup pattern
    const browserSetupRegex =
      /(const\s+browser\s*=\s*await\s+chromium\.launch[\s\S]*?;)/;
    if (browserSetupRegex.test(testScript)) {
      return testScript.replace(
        browserSetupRegex,
        `$1\n\n  // Ensure traces are saved to a unique location to prevent conflicts during parallel execution\n  const context = await browser.newContext();\n  await context.tracing.start({ screenshots: true, snapshots: true, dir: '${traceDir}' });\n`,
      );
    }
  }

  // If script already includes tracing but without a custom directory, add the directory
  if (
    testScript.includes('context.tracing.start') &&
    !testScript.includes('dir:')
  ) {
    return testScript.replace(
      /(await\s+context\.tracing\.start\s*\(\s*\{[^}]*)\}/,
      `$1, dir: '${traceDir}'}`,
    );
  }

  return testScript;
}

// Helper function to check if a file exists with fs.promises
const fsExists = async (path) => {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
};

// Interface defining the result from the internal _executePlaywright function
interface PlaywrightExecutionResult {
  success: boolean;
  error: string | null;
  stdout: string;
  stderr: string;
}

@Injectable()
export class ExecutionService {
  private readonly logger = new Logger(ExecutionService.name);
  private readonly testExecutionTimeoutMs: number;
  private readonly jobExecutionTimeoutMs: number;
  private readonly playwrightConfigPath: string;
  private readonly baseLocalRunDir: string;

  constructor(
    private configService: ConfigService,
    private s3Service: S3Service,
    private dbService: DbService,
    private redisService: RedisService,
  ) {
    // Set timeouts: 2 minutes for tests, 15 minutes for jobs (as per user request)
    this.testExecutionTimeoutMs = this.configService.get<number>(
      'TEST_EXECUTION_TIMEOUT_MS',
      120000,
    ); // 2 minutes
    this.jobExecutionTimeoutMs = this.configService.get<number>(
      'JOB_EXECUTION_TIMEOUT_MS',
      900000,
    ); // 15 minutes

    // Determine Playwright config path
    const configPath = path.join(process.cwd(), 'playwright.config.js');
    if (!existsSync(configPath)) {
      this.logger.warn(
        'playwright.config.js not found at project root. Playwright might use defaults or fail.',
      );
      // Consider throwing an error if config is mandatory
    }
    this.playwrightConfigPath = configPath;

    this.baseLocalRunDir = path.join(process.cwd(), 'playwright-reports');
    this.logger.log(
      `Test execution timeout set to: ${this.testExecutionTimeoutMs}ms (${this.testExecutionTimeoutMs / 1000}s)`,
    );
    this.logger.log(
      `Job execution timeout set to: ${this.jobExecutionTimeoutMs}ms (${this.jobExecutionTimeoutMs / 1000}s)`,
    );
    this.logger.log(`Base local run directory: ${this.baseLocalRunDir}`);
    this.logger.log(
      `Using Playwright config (relative): ${path.relative(process.cwd(), this.playwrightConfigPath)}`,
    );

    // Ensure base local dir exists and has correct permissions
    this.ensureBaseDirectoryPermissions();
  }

  /**
   * Ensures base directory exists and has correct permissions for the nodejs user
   */
  private async ensureBaseDirectoryPermissions(): Promise<void> {
    try {
      // Create the base directory if it doesn't exist
      await fs.mkdir(this.baseLocalRunDir, { recursive: true });
      
      // Test write permissions by creating and removing a test file
      const testFile = path.join(this.baseLocalRunDir, '.permission-test');
      await fs.writeFile(testFile, 'test', { mode: 0o644 });
      await fs.unlink(testFile);
      
      this.logger.log(`Base directory permissions verified: ${this.baseLocalRunDir}`);
    } catch (error: any) {
      this.logger.error(
        `Failed to create or verify permissions for base directory ${this.baseLocalRunDir}: ${error.message}`,
        error.stack,
      );
      
      // Try to fix permissions if possible (works when container has sufficient privileges)
      try {
        const { execSync } = require('child_process');
        execSync(`chmod -R 755 ${this.baseLocalRunDir}`, { stdio: 'ignore' });
        this.logger.log(`Attempted to fix permissions for ${this.baseLocalRunDir}`);
      } catch (chmodError) {
        this.logger.warn(`Could not fix permissions: ${chmodError.message}`);
      }
    }
  }

  /**
   * Creates a run directory with proper permissions and enhanced error handling
   */
  private async createRunDirectoryWithPermissions(runDir: string, entityId: string): Promise<void> {
    try {
      await fs.mkdir(runDir, { recursive: true });
      this.logger.debug(`[${entityId}] Successfully created run directory: ${runDir}`);
    } catch (error: any) {
      if (error.code === 'EACCES') {
        this.logger.error(
          `[${entityId}] Permission denied when creating directory ${runDir}. ` +
          `This usually happens when the mounted volume has incorrect ownership. ` +
          `Container user: nodejs (UID 1001), Error: ${error.message}`,
        );
        
        // Try alternative approaches
        try {
          // Check if parent directory exists and is writable
          const parentDir = path.dirname(runDir);
          await fs.access(parentDir, fs.constants.F_OK | fs.constants.W_OK);
          
          // Try creating with explicit permissions
          await fs.mkdir(runDir, { recursive: true, mode: 0o755 });
          this.logger.log(`[${entityId}] Successfully created directory with explicit permissions`);
        } catch (fallbackError: any) {
          this.logger.error(
            `[${entityId}] All attempts to create directory failed. ` +
            `Please ensure the host directory has correct ownership (UID 1001) or is writable by the container. ` +
            `Fallback error: ${fallbackError.message}`,
          );
          throw new Error(
            `Unable to create test execution directory: ${error.message}. ` +
            `Please check Docker volume mount permissions for playwright-reports directory.`
          );
        }
      } else {
        this.logger.error(`[${entityId}] Unexpected error creating directory ${runDir}: ${error.message}`);
        throw error;
      }
    }
  }

  /**
   * Runs a single test defined by the task data.
   * Adapted from the original test worker handler.
   */
  async runSingleTest(task: TestExecutionTask): Promise<TestResult> {
    const { testId, code } = task;
    this.logger.log(`[${testId}] Starting single test execution.`);

    // Generate unique ID for this run to avoid conflicts in parallel executions
    const uniqueRunId = `${testId}-${crypto.randomUUID().substring(0, 8)}`;
    const runDir = path.join(this.baseLocalRunDir, uniqueRunId);
    const s3ReportKeyPrefix = `${testId}/report`;
    const entityType = 'test';
    let finalResult: TestResult;
    let s3Url: string | null = null;
    const finalError: string | null = null;
    const timestamp = new Date().toISOString();
    const testSuccess = false;
    const stdout_log = '';
    const stderr_log = '';

    try {
      // 1. Validate input
      if (!code || typeof code !== 'string' || code.trim().length === 0) {
        throw new Error('No test code provided.');
      }

      // 2. Store initial metadata about the run
      await this.dbService.storeReportMetadata({
        entityId: testId,
        entityType,
        status: 'running',
        reportPath: s3ReportKeyPrefix,
      });

      // 3. Create test script and prepare runner
      let testDirPath: string;

      try {
        // Prepare the test script in the run directory
        // Note: prepareSingleTest now returns the directory path, not the file path
        testDirPath = await this.prepareSingleTest(testId, code, runDir);
      } catch (error) {
        throw new Error(`Failed to prepare test: ${error.message}`);
      }

      // 4. Execute the test script using the native Playwright runner with timeout
      this.logger.log(
        `[${testId}] Executing test script with ${this.testExecutionTimeoutMs}ms timeout...`,
      );
      // Pass the directory path to the runner (the runner will find the .spec.js file inside)
      const execResult = await this._executePlaywrightNativeRunner(
        testDirPath,
        false,
      );

      // 5. Process result and upload report
      const testBucket = this.s3Service.getBucketForEntityType(entityType);
      let finalStatus: 'passed' | 'failed' = 'failed'; // Default to failed

      if (execResult.success) {
        finalStatus = 'passed';
        this.logger.log(`[${testId}] Playwright execution successful.`);

        // Use same reporting structure as job execution
        // First, check if there's a normal report generated in the specified output directory
        let reportFound = false;
        // Look for the outputDir generated by Playwright during execution
        const outputDir = path.join(runDir, `report-${testId.substr(0, 8)}`);

        if (existsSync(outputDir)) {
          this.logger.log(
            `[${testId}] Checking for HTML report in output directory: ${outputDir}`,
          );
          try {
            const reportFiles = await fs.readdir(outputDir);
            this.logger.log(
              `[${testId}] Found files in output directory: ${reportFiles.join(', ')}`,
            );

            // Look for index.html in the output directory
            if (reportFiles.includes('index.html')) {
              this.logger.log(
                `[${testId}] Found index.html in output directory, uploading report from ${outputDir}`,
              );
              reportFound = true;

              try {
                // Process the report files to fix trace URLs before uploading
                await this._processReportFilesForS3(
                  outputDir,
                  testId,
                  entityType,
                );

                await this.s3Service.uploadDirectory(
                  outputDir,
                  s3ReportKeyPrefix,
                  testBucket,
                  testId,
                  entityType,
                );
                this.logger.log(
                  `[${testId}] Report directory contents uploaded to S3 prefix: ${s3ReportKeyPrefix}`,
                );
                s3Url =
                  this.s3Service.getBaseUrlForEntity(entityType, testId) +
                  '/index.html';
              } catch (uploadErr: any) {
                this.logger.error(
                  `[${testId}] Report upload failed from ${outputDir}: ${uploadErr.message}`,
                );
                s3Url = null;
              }
            }
          } catch (err) {
            this.logger.error(
              `[${testId}] Error reading output directory: ${err.message}`,
            );
          }
        }

        // If no report found in the output directory, check for the default playwright-report location
        if (!reportFound) {
          const playwrightReportDir = path.join(runDir, 'pw-report');

          if (existsSync(playwrightReportDir)) {
            this.logger.log(
              `[${testId}] Found HTML report in default location: ${playwrightReportDir}`,
            );
            try {
              // Process the report files to fix trace URLs before uploading
              await this._processReportFilesForS3(
                playwrightReportDir,
                testId,
                entityType,
              );

              // Upload the playwright-report directory contents
              await this.s3Service.uploadDirectory(
                playwrightReportDir,
                s3ReportKeyPrefix,
                testBucket,
                testId,
                entityType,
              );
              this.logger.log(
                `[${testId}] Report directory uploaded from default location to S3 prefix: ${s3ReportKeyPrefix}`,
              );
              reportFound = true;
              s3Url =
                this.s3Service.getBaseUrlForEntity(entityType, testId) +
                '/index.html';
            } catch (uploadErr: any) {
              this.logger.error(
                `[${testId}] Report upload failed from default location: ${uploadErr.message}`,
              );
              s3Url = null;
            }
          }
        }

        // If we still haven't found a report, log an error
        if (!reportFound) {
          this.logger.warn(
            `[${testId}] No HTML report found in any expected location. S3 URL might not point to a viewable report.`,
          );

          // Keep s3Url pointing to where index.html *should* be. User might need to browse S3.
          this.logger.warn(
            `[${testId}] No valid HTML report found. S3 URL will point to an expected but possibly missing index.html.`,
          );
        }

        // Publish final status
        await this.dbService.storeReportMetadata({
          entityId: testId,
          entityType,
          reportPath: s3ReportKeyPrefix,
          status: 'passed',
          s3Url: s3Url ?? undefined,
        });

        finalResult = {
          success: true,
          reportUrl: s3Url,
          testId,
          stdout: execResult.stdout,
          stderr: execResult.stderr,
          error: null,
        };
      } else {
        // Playwright execution failed
        finalStatus = 'failed';
        const specificError =
          execResult.error ||
          'Playwright execution failed with an unknown error.';
        this.logger.error(
          `[${testId}] Playwright execution failed: ${specificError}`,
        );

        // Log stdout and stderr specifically on failure *before* upload attempt
        if (execResult.stdout) {
          this.logger.error(
            `[${testId}] Playwright stdout:\n--- STDOUT START ---\n${execResult.stdout}\n--- STDOUT END ---\n`,
          );
        }
        if (execResult.stderr) {
          this.logger.error(
            `[${testId}] Playwright stderr:\n--- STDERR START ---\n${execResult.stderr}\n--- STDERR END ---\n`,
          );
        }

        // Even on failure, attempt to upload the local report directory
        let reportFound = false;
        // Look for the outputDir generated by Playwright during execution
        const outputDir = path.join(runDir, `report-${testId.substr(0, 8)}`);

        if (existsSync(outputDir)) {
          this.logger.log(
            `[${testId}] Checking for HTML report in output directory: ${outputDir}`,
          );
          try {
            const reportFiles = await fs.readdir(outputDir);

            // Look for index.html in the output directory
            if (reportFiles.includes('index.html')) {
              this.logger.log(
                `[${testId}] Found index.html in output directory for failure case, uploading report from ${outputDir}`,
              );
              reportFound = true;

              try {
                // Process the report files to fix trace URLs before uploading
                await this._processReportFilesForS3(
                  outputDir,
                  testId,
                  entityType,
                );

                await this.s3Service.uploadDirectory(
                  outputDir,
                  s3ReportKeyPrefix,
                  testBucket,
                  testId,
                  entityType,
                );
                this.logger.log(
                  `[${testId}] Error report/artifacts uploaded to S3 prefix: ${s3ReportKeyPrefix}`,
                );
                s3Url =
                  this.s3Service.getBaseUrlForEntity(entityType, testId) +
                  '/index.html';
              } catch (uploadErr: any) {
                this.logger.error(
                  `[${testId}] Report upload failed from ${outputDir}: ${uploadErr.message}`,
                );
                s3Url = null;
              }
            }
          } catch (err) {
            this.logger.error(
              `[${testId}] Error reading output directory: ${err.message}`,
            );
          }
        }

        // If no report found in the output directory, check for the default playwright-report location
        if (!reportFound) {
          const playwrightReportDir = path.join(runDir, 'pw-report');

          if (existsSync(playwrightReportDir)) {
            this.logger.log(
              `[${testId}] Found HTML report in default location for failure case: ${playwrightReportDir}`,
            );
            try {
              // Process the report files to fix trace URLs before uploading
              await this._processReportFilesForS3(
                playwrightReportDir,
                testId,
                entityType,
              );

              // Upload the playwright-report directory contents
              await this.s3Service.uploadDirectory(
                playwrightReportDir,
                s3ReportKeyPrefix,
                testBucket,
                testId,
                entityType,
              );
              this.logger.log(
                `[${testId}] Error report/artifacts uploaded from default location to S3 prefix: ${s3ReportKeyPrefix}`,
              );
              reportFound = true;
              s3Url =
                this.s3Service.getBaseUrlForEntity(entityType, testId) +
                '/index.html';
            } catch (uploadErr: any) {
              this.logger.error(
                `[${testId}] Report upload failed from default location: ${uploadErr.message}`,
              );
              s3Url = null;
            }
          }
        }

        // If we still haven't found a report, log an error
        if (!reportFound) {
          this.logger.warn(
            `[${testId}] No HTML report found in any expected location for failure case. S3 URL might not point to a viewable report.`,
          );
        }

        // Update status *after* logging and upload attempt
        await this.dbService.storeReportMetadata({
          entityId: testId,
          entityType,
          reportPath: s3ReportKeyPrefix,
          status: 'failed',
          s3Url: s3Url ?? undefined, // Use final s3Url
        });

        // <<< CHANGED: Construct and return failure result object >>>
        finalResult = {
          success: false,
          error: specificError,
          reportUrl: s3Url,
          testId,
          stdout: execResult.stdout,
          stderr: execResult.stderr,
        };

        // <<< REMOVED: Do not throw error here; return the result object >>>
        // throw new Error(specificError); // OLD WAY
      }
    } catch (error: any) {
      // Catch unexpected errors during the process
      this.logger.error(
        `[${testId}] Unhandled error during single test execution: ${error.message}`,
        error.stack,
      );

      // Ensure DB status is marked as failed
      await this.dbService
        .storeReportMetadata({
          entityId: testId,
          entityType,
          reportPath: s3ReportKeyPrefix,
          status: 'failed',
          s3Url: s3Url ?? undefined, // Use final s3Url
        })
        .catch((dbErr) =>
          this.logger.error(
            `[${testId}] Failed to update DB status on error: ${dbErr.message}`,
          ),
        );

      finalResult = {
        success: false,
        error: error.message,
        reportUrl: null,
        testId,
        stdout: '',
        stderr: error.stack || error.message,
      };
      // Propagate the error to the BullMQ processor so the job is marked as failed
      throw error;
    } finally {
      // 6. Cleanup local run directory
      // Skip cleanup to preserve test reports
      this.logger.debug(
        `[${testId}] Preserving local run directory: ${runDir}`,
      );
      // Comment out the cleanup code
      /*
            await fs.rm(runDir, { recursive: true, force: true }).catch(err => {
                this.logger.warn(`[${testId}] Failed to cleanup local run directory ${runDir}: ${err.message}`);
            });
            */
    }

    return finalResult;
  }

  /**
   * Runs a job (multiple tests) defined by the task data.
   * Uses the native Playwright test runner and HTML reporter.
   */
  async runJob(task: JobExecutionTask): Promise<TestExecutionResult> {
    const { runId, testScripts, originalJobId, trigger } = task;
    const entityType = 'job';
    this.logger.log(
      `[${runId}] Starting job execution with ${testScripts.length} tests.`,
    );

    // Generate unique ID for this run to avoid conflicts in parallel executions
    const uniqueRunId = `${runId}-${crypto.randomUUID().substring(0, 8)}`;
    const runDir = path.join(this.baseLocalRunDir, uniqueRunId);
    const reportDir = path.join(runDir, 'report');
    const s3ReportKeyPrefix = `${runId}/report`;
    let finalResult: TestExecutionResult;
    let s3Url: string | null = null;
    let finalError: string | null = null;
    const timestamp = new Date().toISOString();
    let overallSuccess = false; // Default to failure
    let stdout_log = '';
    let stderr_log = '';

    try {
      // 1. Validate input
      if (!testScripts || testScripts.length === 0) {
        throw new Error('No test scripts provided for job execution');
      }

      // 2. Create necessary directories with enhanced error handling
      await this.createRunDirectoryWithPermissions(runDir, runId);
      // reportDir will be created by the copy operation later
      this.logger.debug(`[${runId}] Created local run directory: ${runDir}`);

      // Store initial metadata
      await this.dbService.storeReportMetadata({
        entityId: runId,
        entityType,
        status: 'running',
        reportPath: s3ReportKeyPrefix,
      });

      // Process each script, creating a Playwright test file for each
      for (let i = 0; i < testScripts.length; i++) {
        const { id, script: originalScript, name } = testScripts[i];
        const testId = id;

        try {
          // Ensure the script has proper trace configuration
          const script = ensureProperTraceConfiguration(originalScript, testId);

          // Create the test file with unique ID in filename
          const testFilePath = path.join(runDir, `${testId}.spec.js`);

          // Write the individual test script content
          // No need to remove require/import as each is a standalone file
          await fs.writeFile(testFilePath, script);
          this.logger.debug(
            `[${runId}] Individual test spec written to: ${testFilePath}`,
          );
        } catch (error) {
          this.logger.error(
            `[${runId}] Error creating test file for ${testId}: ${error.message}`,
            error.stack,
          );
          continue;
        }
      }

      if (testScripts.length === 0) {
        throw new Error('No valid test scripts found to execute for this job.');
      }
      this.logger.log(
        `[${runId}] Prepared ${testScripts.length} individual test spec files.`,
      );

      // 4. Execute ALL tests in the runDir using the native runner
      this.logger.log(
        `[${runId}] Executing all test specs in directory via Playwright runner (timeout: ${this.jobExecutionTimeoutMs}ms)...`,
      );
      // Pass isJob=true so the helper knows to execute the directory
      const execResult = await this._executePlaywrightNativeRunner(
        runDir,
        true,
      );
      overallSuccess = execResult.success;
      stdout_log = execResult.stdout;
      stderr_log = execResult.stderr;
      finalError = execResult.error;

      // 5. Process result and upload report
      this.logger.log(
        `[${runId}] Playwright execution finished. Overall success: ${overallSuccess}.`,
      );

      const jobBucket = this.s3Service.getBucketForEntityType(entityType);
      s3Url =
        this.s3Service.getBaseUrlForEntity(entityType, runId) + '/index.html';

      // First, check if there's a normal report generated in the specified output directory
      let reportFound = false;

      if (existsSync(reportDir)) {
        this.logger.log(
          `[${runId}] Checking for HTML report in output directory: ${reportDir}`,
        );
        const reportFiles = await fs.readdir(reportDir);
        this.logger.log(
          `[${runId}] Found files in output directory: ${reportFiles.join(', ')}`,
        );

        // Look for index.html in the output directory
        if (reportFiles.includes('index.html')) {
          this.logger.log(
            `[${runId}] Found index.html in output directory, uploading report from ${reportDir}`,
          );
          reportFound = true;

          try {
            // Process the report files to fix trace URLs before uploading
            await this._processReportFilesForS3(reportDir, runId, entityType);

            await this.s3Service.uploadDirectory(
              reportDir,
              s3ReportKeyPrefix,
              jobBucket,
              runId,
              entityType,
            );
            this.logger.log(
              `[${runId}] Report directory contents uploaded to S3 prefix: ${s3ReportKeyPrefix}`,
            );
          } catch (uploadErr: any) {
            this.logger.error(
              `[${runId}] Report upload failed from ${reportDir}: ${uploadErr.message}`,
            );
            s3Url = null;
            overallSuccess = false;
            finalError =
              finalError || `Report upload failed: ${uploadErr.message}`;
          }
        }
      }

      // If no report found in the output directory, check for the default playwright-report location
      if (!reportFound) {
        const serviceRoot = process.cwd();
        const playwrightReportDir = path.join(runDir, 'pw-report');

        if (existsSync(playwrightReportDir)) {
          this.logger.log(
            `[${runId}] Found HTML report in default location: ${playwrightReportDir}`,
          );
          try {
            // Process the report files to fix trace URLs before uploading
            await this._processReportFilesForS3(
              playwrightReportDir,
              runId,
              entityType,
            );

            // Upload the playwright-report directory contents
            await this.s3Service.uploadDirectory(
              playwrightReportDir,
              s3ReportKeyPrefix,
              jobBucket,
              runId,
              entityType,
            );
            this.logger.log(
              `[${runId}] Report directory uploaded from default location to S3 prefix: ${s3ReportKeyPrefix}`,
            );
            reportFound = true;
          } catch (uploadErr: any) {
            this.logger.error(
              `[${runId}] Report upload failed from default location: ${uploadErr.message}`,
            );
            s3Url = null;
            overallSuccess = false;
            finalError =
              finalError || `Report upload failed: ${uploadErr.message}`;
          }
        }
      }

      // If we still haven't found a report, log an error
      if (!reportFound) {
        this.logger.warn(
          `[${runId}] No HTML report found in any expected location. S3 URL might not point to a viewable report.`,
        );
        if (existsSync(reportDir)) {
          // If the reportDir exists but doesn't have index.html, upload it anyway for the artifacts
          try {
            // Process the report files to fix trace URLs before uploading
            await this._processReportFilesForS3(reportDir, runId, entityType);

            await this.s3Service.uploadDirectory(
              reportDir,
              s3ReportKeyPrefix,
              jobBucket,
              runId,
              entityType,
            );
            this.logger.log(
              `[${runId}] Uploaded test artifacts to S3 prefix: ${s3ReportKeyPrefix}`,
            );
          } catch (uploadErr: any) {
            this.logger.error(
              `[${runId}] Artifacts upload failed: ${uploadErr.message}`,
            );
          }
        }

        // Keep s3Url pointing to where index.html *should* be. User might need to browse S3.
        this.logger.warn(
          `[${runId}] No valid HTML report found. S3 URL will point to an expected but possibly missing index.html.`,
        );
      }

      // Before publishing final status, calculate duration
      const endTime = new Date();
      const startTimeMs = new Date(timestamp).getTime();
      const durationMs = endTime.getTime() - startTimeMs;
      const durationStr = this.formatDuration(durationMs);
      const durationSeconds = this.getDurationSeconds(durationMs);

      // Update the finalResult to include duration
      finalResult = {
        jobId: runId,
        success: overallSuccess,
        error: finalError,
        reportUrl: s3Url,
        // Individual results are less meaningful with a combined report,
        // but we can pass overall status for now.
        results: testScripts.map((ts) => ({
          testId: ts.id,
          success: overallSuccess,
          error: overallSuccess ? null : finalError,
          reportUrl: s3Url, // Link to the combined job report
        })),
        timestamp,
        duration: durationStr,
        stdout: stdout_log,
        stderr: stderr_log,
      };

      // 6. Store final metadata in DB & publish status
      const finalStatus = overallSuccess ? 'passed' : 'failed';
      await this.dbService.storeReportMetadata({
        entityId: runId,
        entityType,
        reportPath: s3ReportKeyPrefix,
        status: finalStatus,
        s3Url: s3Url ?? undefined,
      });

      // Update the run record in the database with the duration
      try {
        await this.dbService.updateRunStatus(
          runId,
          finalStatus,
          durationSeconds.toString(),
        );
      } catch (updateError) {
        this.logger.error(
          `[${runId}] Error updating run duration: ${updateError.message}`,
          updateError.stack,
        );
      }

      // Store final run result
      await this.dbService.updateRunStatus(runId, finalStatus, durationStr);
    } catch (error) {
      this.logger.error(
        `[${runId}] Unhandled error during job execution: ${error.message}`,
        error.stack,
      );
      const finalStatus = 'failed';
      // Attempt to mark DB as failed
      await this.dbService
        .storeReportMetadata({
          entityId: runId,
          entityType,
          reportPath: s3ReportKeyPrefix,
          status: finalStatus,
          s3Url: s3Url ?? undefined,
        })
        .catch((dbErr) =>
          this.logger.error(
            `[${runId}] Failed to update DB status on error: ${dbErr.message}`,
          ),
        );

      // Store final run result with error
      await this.dbService.updateRunStatus(runId, 'failed', '0ms');

      finalResult = {
        jobId: runId,
        success: false,
        error: error.message,
        reportUrl: null,
        results: [],
        timestamp,
        stdout: stdout_log,
        stderr: stderr_log + (error.stack || ''),
      };
      throw error;
    } finally {
      // 7. Cleanup local run directory
      this.logger.debug(`[${runId}] Preserving local run directory: ${runDir}`);
      // Comment out the cleanup code to keep reports
      /*
            await fs.rm(runDir, { recursive: true, force: true }).catch(err => {
                this.logger.warn(`[${runId}] Failed to cleanup local run directory ${runDir}: ${err.message}`);
            });
            */
    }

    return finalResult;
  }

  /**
   * Execute a Playwright test using the native binary
   * @param runDir The base directory for this specific run where test files are located
   * @param isJob Whether this is a job execution (multiple tests)
   */
  private async _executePlaywrightNativeRunner(
    runDir: string, // Directory containing the spec file(s) OR the single spec file for single tests
    isJob: boolean = false, // Flag to indicate if running multiple tests in a dir (job) vs single file
  ): Promise<PlaywrightExecutionResult> {
    const serviceRoot = process.cwd();
    const playwrightConfigPath = path.join(serviceRoot, 'playwright.config.js'); // Get absolute path to config
    // Use a subdirectory in the provided runDir for the standard playwright report
    const playwrightReportDir = path.join(runDir, 'pw-report');

    // Create a unique ID for this execution to prevent conflicts in parallel runs
    let executionId: string;

    if (isJob) {
      // For jobs, use the last part of the runDir path as the ID
      const runDirParts = runDir.split(path.sep);
      executionId = runDirParts[runDirParts.length - 1].substr(0, 8);
    } else {
      // For single tests, extract the testId from the directory name or file name
      const dirName = path.basename(runDir);
      const testId = dirName.split('-')[0]; // Take the part before the first hyphen
      executionId = testId.substr(0, 8);
    }

    // Ensure we have an execution ID
    if (!executionId) {
      executionId = crypto.randomUUID().substring(0, 8);
    }

    try {
      let targetPath: string; // Path to run tests against (file or directory)

      if (isJob) {
        // For jobs, run all tests in the runDir
        targetPath = runDir;
        this.logger.log(
          `[Job Execution ${executionId}] Running tests in directory: ${targetPath}`,
        );
      } else {
        // For single tests, find the specific test.spec.js file
        const files = await fs.readdir(runDir);
        const singleTestFile = files.find((file) => file.endsWith('.spec.js'));
        if (!singleTestFile) {
          throw new Error(
            `No .spec.js file found in ${runDir} for single test execution. Files present: ${files.join(', ')}`,
          );
        }
        targetPath = path.join(runDir, singleTestFile);
        this.logger.log(
          `[Single Test Execution ${executionId}] Running specific test file: ${targetPath}`,
        );
      }

      // Add unique environment variables for this execution
      const envVars = {
        PLAYWRIGHT_TEST_DIR: runDir,
        CI: 'true',
        PLAYWRIGHT_EXECUTION_ID: executionId,
        // Create a unique artifacts folder for this execution
        PLAYWRIGHT_ARTIFACTS_DIR: path.join(
          runDir,
          `.artifacts-${executionId}`,
        ),
        // Standard location for Playwright HTML report
        PLAYWRIGHT_HTML_REPORT: playwrightReportDir,
        // Add timestamp to prevent caching issues
        PLAYWRIGHT_TIMESTAMP: Date.now().toString(),
        // Set the default theme to dark for HTML reports
        PLAYWRIGHT_HTML_REPORT_THEME: 'dark',
      };

      this.logger.debug(
        `Executing playwright with execution ID: ${executionId}`,
      );

      // Handle path differences between Windows and Unix-like systems
      let playwrightCliPath;
      if (isWindows) {
        // On Windows, use the .cmd extension
        playwrightCliPath = path.join(
          serviceRoot,
          'node_modules',
          '.bin',
          'playwright.cmd',
        );
      } else {
        playwrightCliPath = path.join(
          serviceRoot,
          'node_modules',
          '.bin',
          'playwright',
        );
      }

      // Use proper command based on platform
      const command = isWindows ? playwrightCliPath : 'node';

      // Build args array - for Windows the command itself is the executable
      let args: string[];

      if (isWindows) {
        args = [
          'test',
          targetPath,
          `--config=${playwrightConfigPath}`,
          '--reporter=html,list',
        ];
      } else {
        args = [
          playwrightCliPath,
          'test',
          targetPath,
          `--config=${playwrightConfigPath}`,
          '--reporter=html,list',
        ];
      }

      // Add unique output dir for this execution - using consistent naming across job and test
      const outputDir = path.join(runDir, `report-${executionId}`);
      args.push(`--output=${outputDir}`);

      this.logger.log(
        `Running Playwright directly with command: ${command} ${args.join(' ')} and env vars:`,
        envVars,
      );

      // Execute the command with environment variables, ensuring correct CWD
      const execResult = await this._executeCommand(command, args, {
        env: { ...process.env, ...envVars },
        cwd: serviceRoot, // Run playwright from service root
        shell: isWindows, // Use shell on Windows for proper command execution
        timeout: isJob
          ? this.jobExecutionTimeoutMs
          : this.testExecutionTimeoutMs, // Apply timeout
      });

      // Improve error reporting
      let extractedError: string | null = null;
      if (!execResult.success) {
        // Prioritize stderr if it contains meaningful info, otherwise use stdout
        if (
          execResult.stderr &&
          execResult.stderr.trim().length > 0 &&
          !execResult.stderr.toLowerCase().includes('deprecationwarning')
        ) {
          extractedError = execResult.stderr.trim();
        } else if (execResult.stdout) {
          // Look for common Playwright failure summaries in stdout
          const failureMatch = execResult.stdout.match(/(\d+ failed)/);
          if (failureMatch) {
            extractedError = `${failureMatch[1]} - Check report/logs for details.`;
          } else {
            extractedError = 'Script execution failed. Check report/logs.'; // Fallback if stderr is empty/unhelpful
          }
        } else {
          extractedError = 'Script execution failed with no error message.'; // Absolute fallback
        }
      }

      return {
        success: execResult.success,
        error: extractedError, // Use the extracted error message
        stdout: execResult.stdout,
        stderr: execResult.stderr,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        stdout: '',
        stderr: error.stack || '',
      };
    }
  }

  /**
   * Helper method to execute a command with proper error handling and timeout
   */
  private async _executeCommand(
    command: string,
    args: string[],
    options: {
      env?: Record<string, string | undefined>;
      cwd?: string;
      shell?: boolean;
      timeout?: number; // Add timeout option
    } = {},
  ): Promise<{ success: boolean; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      try {
        const childProcess = spawn(command, args, {
          env: { ...process.env, ...(options.env || {}) },
          cwd: options.cwd || process.cwd(),
          shell: options.shell,
        });

        let stdout = '';
        let stderr = '';
        const MAX_BUFFER = 10 * 1024 * 1024; // 10MB buffer limit
        let resolved = false;
        let timeoutHandle: NodeJS.Timeout | undefined;

        // Set up timeout if specified
        if (options.timeout && options.timeout > 0) {
          timeoutHandle = setTimeout(() => {
            if (!resolved) {
              resolved = true;
              this.logger.warn(
                `Command execution timed out after ${options.timeout}ms: ${command} ${args.join(' ')}`,
              );
              childProcess.kill('SIGKILL');
              resolve({
                success: false,
                stdout: stdout + '\n[EXECUTION TIMEOUT]',
                stderr:
                  stderr +
                  `\n[ERROR] Execution timed out after ${options.timeout}ms`,
              });
            }
          }, options.timeout);
        }

        const cleanup = () => {
          if (timeoutHandle) {
            clearTimeout(timeoutHandle);
          }
        };

        childProcess.stdout.on('data', (data) => {
          const chunk = data.toString();
          if (stdout.length < MAX_BUFFER) {
            stdout += chunk;
          } else if (stdout.length === MAX_BUFFER) {
            stdout += '...[TRUNCATED]';
          }
          this.logger.debug(`STDOUT: ${chunk.trim()}`);
        });

        childProcess.stderr.on('data', (data) => {
          const chunk = data.toString();
          if (stderr.length < MAX_BUFFER) {
            stderr += chunk;
          } else if (stderr.length === MAX_BUFFER) {
            stderr += '...[TRUNCATED]';
          }
          this.logger.debug(`STDERR: ${chunk.trim()}`);
        });

        childProcess.on('close', (code) => {
          if (!resolved) {
            resolved = true;
            cleanup();
            this.logger.debug(`Command completed with exit code: ${code}`);
            resolve({
              success: code === 0,
              stdout,
              stderr,
            });
          }
        });

        childProcess.on('error', (error) => {
          if (!resolved) {
            resolved = true;
            cleanup();
            this.logger.error(`Command execution failed: ${error.message}`);
            resolve({
              success: false,
              stdout,
              stderr: stderr + `\n[ERROR] ${error.message}`,
            });
          }
        });
      } catch (error) {
        this.logger.error(
          `Failed to spawn command: ${error instanceof Error ? error.message : String(error)}`,
        );
        resolve({
          success: false,
          stdout: '',
          stderr: `Failed to spawn command: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    });
  }

  /**
   * Fix trace file paths in HTML reports before uploading to S3
   * This prevents issues when absolute file paths are used in trace URLs
   */
  private async _processReportFilesForS3(
    reportDir: string,
    runId: string,
    entityType: string,
  ): Promise<void> {
    try {
      // Look for index.html in the report directory
      const indexPath = path.join(reportDir, 'index.html');
      if (!existsSync(indexPath)) {
        this.logger.warn(
          `No index.html found in ${reportDir}, skipping trace path processing`,
        );
        return;
      }

      // Process HTML files in the report directory
      const processHtmlFile = async (filePath: string) => {
        this.logger.log(`Processing HTML file at ${filePath}`);
        let content = await fs.readFile(filePath, 'utf8');
        let modified = false;

        // Patterns to replace absolute trace paths with relative ones
        const patterns = [
          // Pattern 1: URL search parameter with absolute path to trace.zip
          {
            regex: /trace=(https?:\/\/[^"'&]+\/[^"'&]+\/trace\.zip)/g,
            replacement: 'trace=../data',
          },
          // Pattern 2: Direct absolute path references to trace.zip
          {
            regex: /(["'])(https?:\/\/[^"']+\/[^"']+\/trace\.zip)(['"])/g,
            replacement: '$1../data$3',
          },
          // Pattern 3: Absolute file paths starting with file:// or /Users, /home, etc.
          {
            regex:
              /(["'])(file:\/\/\/|\/(?:Users|home|var|tmp)[^"']+\/trace\.zip)(['"])/g,
            replacement: '$1../data$3',
          },
          // Pattern 4: Windows absolute paths (C:\, D:\, etc.)
          {
            regex: /(["'])([A-Z]:\\[^"']+\\trace\.zip)(['"])/g,
            replacement: '$1../data$3',
          },
          // Pattern 5: Trace directory paths (including custom trace-* directories)
          {
            regex:
              /(["'])(\.\/trace-[^"']+|\.playwright-artifacts-\d+\/traces)[^"']*(['"])/g,
            replacement: '$1../data$3',
          },
          // Pattern 6: Any reference to .network files in absolute paths
          {
            regex: /(["'])(\/[^"']+\.network)(['"])/g,
            replacement: '$1../data$3',
          },
          // Pattern 7: Any path with the runId in it - could be an artifact path
          {
            regex: new RegExp(`(["'])(\/[^"']*${runId}[^"']*)(['"])`, 'g'),
            replacement: '$1../data$3',
          },
        ];

        // Apply all patterns
        for (const pattern of patterns) {
          const newContent = content.replace(
            pattern.regex,
            pattern.replacement,
          );
          if (newContent !== content) {
            modified = true;
            content = newContent;
          }
        }

        // Process iframe srcs that might contain trace references
        const iframeSrcRegex = /<iframe[^>]+src=["']([^"']+)["'][^>]*>/g;
        let match;
        while ((match = iframeSrcRegex.exec(content)) !== null) {
          const originalSrc = match[1];
          if (originalSrc.includes('trace') || originalSrc.includes(runId)) {
            // Replace absolute paths in iframe src with relative ones
            const newSrc = originalSrc.replace(
              /\/[^/]+\/trace\.zip/,
              '../data',
            );
            if (newSrc !== originalSrc) {
              content = content.replace(originalSrc, newSrc);
              modified = true;
            }
          }
        }

        // Only save the file if we made changes
        if (modified) {
          await fs.writeFile(filePath, content, 'utf8');
          this.logger.log(`Successfully processed trace paths in ${filePath}`);
        } else {
          this.logger.log(`No trace path replacements needed in ${filePath}`);
        }
      };

      // Process main index.html
      await processHtmlFile(indexPath);

      // Process trace/index.html if it exists
      const traceIndexPath = path.join(reportDir, 'trace', 'index.html');
      if (existsSync(traceIndexPath)) {
        await processHtmlFile(traceIndexPath);
      }

      // Look for other HTML files in the trace directory
      const traceDir = path.join(reportDir, 'trace');
      if (existsSync(traceDir)) {
        try {
          const files = await fs.readdir(traceDir);
          for (const file of files) {
            if (file.endsWith('.html') && file !== 'index.html') {
              await processHtmlFile(path.join(traceDir, file));
            }
          }
        } catch (err) {
          this.logger.warn(`Error reading trace directory: ${err.message}`);
        }
      }
    } catch (error) {
      // Log error but don't fail the process
      this.logger.error(
        `Error processing report files for S3: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Inner function to handle test preparation
   */
  private async prepareSingleTest(
    testId: string,
    testScript: string,
    runDir: string,
  ): Promise<string> {
    try {
      this.logger.log(`[${testId}] Preparing test in directory: ${runDir}`);

      // Ensure proper trace configuration to avoid path issues
      const enhancedScript = ensureProperTraceConfiguration(testScript, testId);

      // Create the test file with the test ID in the filename for consistent identification
      const testFilePath = path.join(runDir, `${testId}.spec.js`);

      // Ensure the directory exists before writing to it
      await this.createRunDirectoryWithPermissions(runDir, testId);

      // Prepare the script content for the test file
      let scriptForRunner = enhancedScript;
      // Ensure require('@playwright/test') is present if imports were used or if test/expect are used directly
      const usesPlaywrightTest = enhancedScript.includes('@playwright/test');
      const requiresPlaywrightTest =
        enhancedScript.includes('require("@playwright/test")') ||
        enhancedScript.includes("require('@playwright/test')");

      if (usesPlaywrightTest && !requiresPlaywrightTest) {
        // Add require if import was used but require wasn't
        scriptForRunner = `const { test, expect } = require('@playwright/test');\n${enhancedScript}`;
        // Remove the ES6 import statement as we added require
        scriptForRunner = scriptForRunner.replace(
          /import\s+{[^}]*}\s+from\s+['"]@playwright\/test['"];?/g,
          '',
        );
      } else if (
        !usesPlaywrightTest &&
        !requiresPlaywrightTest &&
        (enhancedScript.includes('test(') || enhancedScript.includes('expect('))
      ) {
        // If no import/require detected, but test() or expect() seem to be used, add the require statement
        scriptForRunner = `const { test, expect } = require('@playwright/test');\n${enhancedScript}`;
      }

      // Create a simple, descriptive test name for better reporting
      if (!scriptForRunner.includes('test(')) {
        // If we don't see any test definition, wrap the code in a test block
        scriptForRunner = `
const { test, expect } = require('@playwright/test');

test('Automated Test ${testId.substring(0, 8)}', async ({ page }) => {
    ${scriptForRunner}
});`;
      }

      // Write the script to the test file
      await fs.writeFile(testFilePath, scriptForRunner);
      this.logger.log(`[${testId}] Created test file at: ${testFilePath}`);

      return runDir; // Return the directory path similar to how _executePlaywrightNativeRunner is called
    } catch (error) {
      this.logger.error(
        `[${testId}] Failed to prepare test: ${error.message}`,
        error.stack,
      );
      throw new Error(`Test preparation failed: ${error.message}`);
    }
  }

  /**
   * Formats duration in ms to a human-readable string
   * @param durationMs Duration in milliseconds
   * @returns Formatted duration string like "3s" or "1m 30s"
   */
  private formatDuration(durationMs: number): string {
    const seconds = Math.floor(durationMs / 1000);
    if (seconds < 60) {
      return `${seconds}s`;
    } else {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return remainingSeconds > 0
        ? `${minutes}m ${remainingSeconds}s`
        : `${minutes}m`;
    }
  }

  /**
   * Gets the duration in seconds from milliseconds
   * @param durationMs Duration in milliseconds
   * @returns Total seconds
   */
  private getDurationSeconds(durationMs: number): number {
    return Math.floor(durationMs / 1000);
  }
}
