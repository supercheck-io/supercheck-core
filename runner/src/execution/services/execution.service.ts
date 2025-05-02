import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn, execSync, exec } from 'child_process';
import * as fs from 'fs/promises';
import { existsSync, mkdirSync, writeFileSync, cpSync, readFileSync, rmSync } from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { S3Service } from './s3.service';
import { DbService } from './db.service';
import { ValidationService } from './validation.service';
import { RedisService } from './redis.service';
import {
    TestResult,
    TestExecutionResult,
    TestScript,
    TestExecutionTask,
    JobExecutionTask
} from '../interfaces';
import {
    isWindows,
    toCLIPath,
    getTemporaryRunPath,
    createDiscoverableTestFile,
    ensureProperTraceConfiguration
} from '../utils';

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
    private readonly playwrightConfigPath: string;
    private readonly baseLocalRunDir: string;

    constructor(
        private configService: ConfigService,
        private s3Service: S3Service,
        private dbService: DbService,
        private validationService: ValidationService,
        private redisService: RedisService,
    ) {
        this.testExecutionTimeoutMs = this.configService.get<number>('TEST_EXECUTION_TIMEOUT_MS', 900000);
        // Determine Playwright config path
        const configPath = path.join(process.cwd(), 'playwright.config.js');
        if (!existsSync(configPath)) {
            this.logger.warn('playwright.config.js not found at project root. Playwright might use defaults or fail.');
            // Consider throwing an error if config is mandatory
        }
        this.playwrightConfigPath = configPath;

        this.baseLocalRunDir = path.join(process.cwd(), 'local-test-runs');
        this.logger.log(`Test execution timeout set to: ${this.testExecutionTimeoutMs}ms`);
        this.logger.log(`Base local run directory: ${this.baseLocalRunDir}`);
        this.logger.log(`Using Playwright config (relative): ${path.relative(process.cwd(), this.playwrightConfigPath)}`);

        // Ensure base local dir exists asynchronously (fire-and-forget)
        fs.mkdir(this.baseLocalRunDir, { recursive: true })
            .catch(err => this.logger.error(`Failed to create base local directory ${this.baseLocalRunDir}: ${err.message}`));
    }

    /**
     * Runs a single test defined by the task data.
     * Adapted from the original test worker handler.
     */
    async runSingleTest(task: TestExecutionTask): Promise<TestResult> {
        const { testId, code } = task;
        this.logger.log(`[${testId}] Starting single test execution.`);

        await this.redisService.publishTestStatus(testId, { status: 'running' });

        const runDir = path.join(this.baseLocalRunDir, testId);
        const reportDir = path.join(runDir, 'report');
        const s3ReportKeyPrefix = `test-results/tests/${testId}/report`;
        const entityType = 'test';
        let finalResult: TestResult;
        let s3Url: string | null = null;

        try {
            // Initialize finalResult with a default failure state early on
            // This ensures it's always assigned before potential use in error/finally blocks
            finalResult = {
                success: false,
                error: 'Execution did not complete',
                reportUrl: null,
                testId,
                stdout: '',
                stderr: '',
            };
            
            await this.dbService.storeReportMetadata({
                entityId: testId, entityType, status: 'running', reportPath: s3ReportKeyPrefix
            });

            // Construct the correct base S3 URL *once*
            const baseS3ReportUrl = this.s3Service.getBaseUrlForEntity(entityType, testId) + '/index.html';
            s3Url = baseS3ReportUrl; // Assign here, can be overwritten later if upload fails

            // 1. Create necessary directories (runDir includes reportDir now)
            await fs.mkdir(reportDir, { recursive: true });
            this.logger.debug(`[${testId}] Created local run/report directory: ${reportDir}`);

            // 2. Validate code
            const validationResult = this.validationService.validateCode(code);
            if (!validationResult.valid) {
                this.logger.warn(`[${testId}] Code validation failed: ${validationResult.error}`);
                
                // Create a simple error report LOCALLY
                const errorReportDir = reportDir; // Place error report in the final report location
                await fs.mkdir(errorReportDir, { recursive: true });
                
                const errorHtml = `
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Validation Error - Test ${testId}</title>
                    <style>
                        body {
                            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                            margin: 0;
                            padding: 20px;
                            color: #333;
                            background-color: #fff;
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            min-height: 80vh;
                            text-align: center;
                            transition: background-color 0.3s, color 0.3s;
                        }
                        
                        @media (prefers-color-scheme: dark) {
                            body {
                                color: #d4d4d4;
                                background-color: #1e1e1e;
                            }
                            .container h1 {
                                color: #d4d4d4;
                            }
                            .container p {
                                color: #aaa; /* Muted foreground equivalent */
                            }
                            .icon {
                                color: #ef4444; /* Darker red */
                            }
                        }
                        
                        .container {
                            max-width: 450px; /* Similar to max-w-md */
                            display: flex;
                            flex-direction: column;
                            align-items: center;
                        }
                        
                        .icon {
                            width: 4rem; /* h-16 */
                            height: 4rem; /* w-16 */
                            color: #ef4444; /* text-red-500 */
                            margin-bottom: 1rem; /* mb-4 */
                        }
                        
                        h1 {
                            font-size: 1.875rem; /* text-3xl */
                            font-weight: 700; /* font-bold */
                            margin-bottom: 0.5rem; /* mb-2 */
                        }
                        
                        p {
                            color: #6b7280; /* text-muted-foreground */
                            margin-bottom: 1.5rem; /* mb-6 */
                            line-height: 1.5;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <svg class="icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
                        <h1>Test Validation Failed</h1>
                        <p>${validationResult.error || 'The test script did not pass validation and could not be executed.'}</p>
                        <!-- Removed Back button as it doesn't make sense here -->
                    </div>
                </body>
                </html>`;
                
                await fs.writeFile(path.join(errorReportDir, 'index.html'), errorHtml);
                
                // Try to upload the error report from the local path
                try {
                    const testBucket = this.s3Service.getBucketForEntityType(entityType);
                    await this.s3Service.uploadDirectory(errorReportDir, s3ReportKeyPrefix, testBucket);
                    // s3Url is already set to baseS3ReportUrl
                    this.logger.log(`[${testId}] Validation error report uploaded to S3 prefix: ${s3ReportKeyPrefix}`);
                } catch (uploadErr) {
                    this.logger.error(`[${testId}] Failed to upload validation error report: ${uploadErr.message}`);
                    s3Url = null; // Set to null on upload failure
                }
                
                // Update status through Redis
                await this.redisService.publishTestStatus(testId, { 
                    status: 'failed', 
                    message: validationResult.error || 'Code validation failed',
                    s3Url: s3Url // Use the potentially updated s3Url
                });
                
                // Update DB status
                await this.dbService.storeReportMetadata({
                    entityId: testId, entityType, reportPath: s3ReportKeyPrefix, 
                    status: 'failed', s3Url: s3Url ?? undefined, // Use potentially updated s3Url
                });
                
                throw new Error(validationResult.error || 'Code validation failed');
            }
            this.logger.debug(`[${testId}] Code validation successful.`);

            // 3. Write the test to a file
            // Don't strip imports - tests are meant to be self-contained
            let testFilePath: string;
            try {
                testFilePath = await this.prepareSingleTest(testId, code, runDir);
            } catch (error) {
                throw new Error(`Failed to prepare test: ${error.message}`);
            }

            // 4. Execute the test script
            this.logger.log(`[${testId}] Executing test script...`);
            // Use the native runner helper function
            const execResult = await this._executePlaywrightNativeRunner(runDir, false);

            // 5. Process result and upload report
            const testBucket = this.s3Service.getBucketForEntityType(entityType);
            let finalStatus: 'completed' | 'failed' = 'failed'; // Default to failed

            if (execResult.success) {
                finalStatus = 'completed';
                this.logger.log(`[${testId}] Playwright execution successful.`);
                // Attempt to upload the report directory
                try {
                    const indexHtmlPath = path.join(reportDir, 'index.html');
                    if (existsSync(indexHtmlPath)) {
                        // Process the report files to fix trace URLs before uploading
                        await this._processReportFilesForS3(reportDir, testId, entityType);
                        
                        await this.s3Service.uploadDirectory(reportDir, s3ReportKeyPrefix, testBucket);
                        this.logger.log(`[${testId}] HTML report uploaded to S3 prefix: ${s3ReportKeyPrefix}`);
                        s3Url = this.s3Service.getBaseUrlForEntity(entityType, testId) + '/index.html';
                    } else {
                        // Handle case where playwright-report might exist instead (e.g., native runner used directly)
                         const defaultPlaywrightReportDir = path.join(process.cwd(), 'playwright-report');
                         const defaultIndexHtml = path.join(defaultPlaywrightReportDir, 'index.html');

                         if (existsSync(defaultIndexHtml)) {
                           this.logger.log(`[${testId}] Found HTML report in default location. Copying to test report directory...`);
                           try {
                             cpSync(defaultPlaywrightReportDir, reportDir, { recursive: true });
                             // Process the report files to fix trace URLs before uploading
                             await this._processReportFilesForS3(reportDir, testId, entityType);
                             await this.s3Service.uploadDirectory(reportDir, s3ReportKeyPrefix, testBucket);
                             this.logger.log(`[${testId}] Copied and uploaded HTML report to S3 prefix: ${s3ReportKeyPrefix}`);
                             s3Url = this.s3Service.getBaseUrlForEntity(entityType, testId) + '/index.html';
                           } catch (copyErr: any) {
                             this.logger.error(`[${testId}] Failed to copy and upload default Playwright report: ${copyErr.message}`);
                             s3Url = null;
                           }
                         } else {
                            this.logger.warn(`[${testId}] Report directory or index.html not found after successful execution. Skipping upload.`);
                            s3Url = null;
                         }
                    }
                } catch (uploadErr: any) {
                    this.logger.error(`[${testId}] Failed to upload HTML report after successful execution: ${uploadErr.message}`);
                    s3Url = null; // Indicate upload failure despite test success
                }

                // Publish final status
                await this.redisService.publishTestStatus(testId, {
                    status: finalStatus,
                    reportPath: s3ReportKeyPrefix,
                    s3Url: s3Url // Use final s3Url
                });
                 await this.dbService.storeReportMetadata({
                    entityId: testId,
                    entityType,
                    reportPath: s3ReportKeyPrefix,
                    status: finalStatus,
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

            } else { // Playwright execution failed
                finalStatus = 'failed';
                const specificError = execResult.error || 'Playwright execution failed with an unknown error.';
                this.logger.error(`[${testId}] Playwright execution failed: ${specificError}`);

                 // Log stdout and stderr specifically on failure *before* upload attempt
                if (execResult.stdout) {
                  this.logger.error(`[${testId}] Playwright stdout:\n--- STDOUT START ---\n${execResult.stdout}\n--- STDOUT END ---\n`);
                }
                if (execResult.stderr) {
                  this.logger.error(`[${testId}] Playwright stderr:\n--- STDERR START ---\n${execResult.stderr}\n--- STDERR END ---\n`);
                }

                // Even on failure, attempt to upload the local report directory
                try {
                   const indexHtmlPath = path.join(reportDir, 'index.html');
                   if (existsSync(indexHtmlPath)) { // Check specifically for index.html on failure too
                        // Process the report files to fix trace URLs before uploading
                        await this._processReportFilesForS3(reportDir, testId, entityType);
                        
                        await this.s3Service.uploadDirectory(reportDir, s3ReportKeyPrefix, testBucket);
                        this.logger.log(`[${testId}] Error report/artifacts uploaded to S3 prefix: ${s3ReportKeyPrefix}`);
                        s3Url = this.s3Service.getBaseUrlForEntity(entityType, testId) + '/index.html';
                   } else {
                     // Check for default Playwright report in root directory
                     const defaultPlaywrightReportDir = path.join(process.cwd(), 'playwright-report');
                     const defaultIndexHtml = path.join(defaultPlaywrightReportDir, 'index.html');

                     if (existsSync(defaultIndexHtml)) {
                       this.logger.log(`[${testId}] Found HTML report in default location. Copying to test report directory...`);
                       try {
                         cpSync(defaultPlaywrightReportDir, reportDir, { recursive: true });
                         // Process the report files to fix trace URLs before uploading
                         await this._processReportFilesForS3(reportDir, testId, entityType);
                         await this.s3Service.uploadDirectory(reportDir, s3ReportKeyPrefix, testBucket);
                         this.logger.log(`[${testId}] Copied and uploaded HTML report to S3 prefix: ${s3ReportKeyPrefix}`);
                         s3Url = this.s3Service.getBaseUrlForEntity(entityType, testId) + '/index.html';
                       } catch (copyErr: any) {
                         this.logger.error(`[${testId}] Failed to copy and upload default Playwright report: ${copyErr.message}`);
                         s3Url = null;
                       }
                     } else {
                       this.logger.warn(`[${testId}] Final report directory (${reportDir}) or index.html not found after failed execution. Skipping upload.`);
                       s3Url = null; // Indicate report is not available
                     }
                   }
                } catch (uploadErr: any) {
                    this.logger.error(`[${testId}] Failed to upload error report/artifacts: ${uploadErr.message}`);
                    s3Url = null; // Indicate upload failure
                }

                // Update status *after* logging and upload attempt
                await this.redisService.publishTestStatus(testId, {
                    status: 'failed',
                    error: specificError, // Use specific error
                    reportPath: s3ReportKeyPrefix,
                    s3Url: s3Url // Use final s3Url
                });
                await this.dbService.storeReportMetadata({
                    entityId: testId, entityType, reportPath: s3ReportKeyPrefix,
                    status: 'failed', s3Url: s3Url ?? undefined, // Use final s3Url
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

        } catch (error: any) { // Catch unexpected errors during the process
            this.logger.error(`[${testId}] Unhandled error during single test execution: ${error.message}`, error.stack);
            
            // Publish error status
            await this.redisService.publishTestStatus(testId, {
                status: 'failed',
                error: error.message,
                s3Url: s3Url // Use whatever s3Url was set to (likely null or the base url)
            }).catch(redisErr => this.logger.error(`[${testId}] Failed to publish error status: ${redisErr.message}`));
            
            // Ensure DB status is marked as failed
            await this.dbService.storeReportMetadata({
                entityId: testId, entityType, reportPath: s3ReportKeyPrefix,
                status: 'failed', s3Url: s3Url ?? undefined, // Use final s3Url
            }).catch(dbErr => this.logger.error(`[${testId}] Failed to update DB status on error: ${dbErr.message}`));
            
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
            // <<< TEMP: Comment out cleanup for debugging failed reports >>>
            // <<< RE-ENABLED Cleanup >>>
            // /*
            this.logger.debug(`[${testId}] Cleaning up local run directory: ${runDir}`);
            await fs.rm(runDir, { recursive: true, force: true }).catch(err => {
                this.logger.warn(`[${testId}] Failed to cleanup local run directory ${runDir}: ${err.message}`);
            });
            // */
        }

        return finalResult;
    }

    /**
     * Runs a job (multiple tests) defined by the task data.
     * Uses the native Playwright test runner and HTML reporter.
     */
    async runJob(task: JobExecutionTask): Promise<TestExecutionResult> {
        const { jobId, testScripts, runId } = task;
        const entityType = 'job';
        this.logger.log(`[${runId}] Starting job execution with ${testScripts.length} tests.`);

        const runDir = path.join(this.baseLocalRunDir, runId);
        const reportDir = path.join(runDir, 'report');
        const s3ReportKeyPrefix = `test-results/${entityType}s/${runId}/report`; // S3 prefix for the final report
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
                throw new Error("No test scripts provided for job execution");
            }

            // 2. Create necessary directories
            await fs.mkdir(runDir, { recursive: true });
            // reportDir will be created by the copy operation later
            this.logger.debug(`[${runId}] Created local run directory: ${runDir}`);

            // Store initial metadata
            await this.dbService.storeReportMetadata({
                entityId: runId, entityType, status: 'running', reportPath: s3ReportKeyPrefix,
            });
            
            // Publish initial job status via Redis
            await this.redisService.publishJobStatus(runId, { status: 'running' });

            // Process each script, creating a Playwright test file for each
            for (let i = 0; i < testScripts.length; i++) {
                const { id, script: originalScript, name } = testScripts[i];
                const testId = id;
                
                try {
                    // Ensure the script has proper trace configuration
                    const script = ensureProperTraceConfiguration(originalScript, testId);
                    
                    // Create the test file with unique ID in filename
                    const testFilePath = path.join(runDir, `test-${i}-${testId}.spec.js`);
                    
                    // Write the individual test script content
                    // No need to remove require/import as each is a standalone file
                    await fs.writeFile(testFilePath, script);
                    this.logger.debug(`[${runId}] Individual test spec written to: ${testFilePath}`);
                } catch (error) {
                    this.logger.error(`[${runId}] Error creating test file for ${testId}: ${error.message}`, error.stack);
                    continue;
                }
            }
            
            if (testScripts.length === 0) {
                throw new Error("No valid test scripts found to execute for this job.");
            }
            this.logger.log(`[${runId}] Prepared ${testScripts.length} individual test spec files.`);

            // 4. Execute ALL tests in the runDir using the native runner
            this.logger.log(`[${runId}] Executing all test specs in directory via Playwright runner...`);
            // Pass isJob=true so the helper knows to execute the directory
            const execResult = await this._executePlaywrightNativeRunner(runDir, true);
            overallSuccess = execResult.success;
            stdout_log = execResult.stdout;
            stderr_log = execResult.stderr;
            finalError = execResult.error;
            
            // 5. Process result and upload report
            this.logger.log(`[${runId}] Playwright execution finished. Overall success: ${overallSuccess}.`);

            const jobBucket = this.s3Service.getBucketForEntityType(entityType);
            s3Url = this.s3Service.getBaseUrlForEntity(entityType, runId) + '/index.html';

            // First, check if there's a normal report generated in the specified output directory
            let reportFound = false;
            
            if (existsSync(reportDir)) {
                this.logger.log(`[${runId}] Checking for HTML report in output directory: ${reportDir}`);
                const reportFiles = await fs.readdir(reportDir);
                this.logger.log(`[${runId}] Found files in output directory: ${reportFiles.join(', ')}`);
                
                // Look for index.html in the output directory
                if (reportFiles.includes('index.html')) {
                    this.logger.log(`[${runId}] Found index.html in output directory, uploading report from ${reportDir}`);
                    reportFound = true;
                    
                    try {
                        // Process the report files to fix trace URLs before uploading
                        await this._processReportFilesForS3(reportDir, runId, entityType);
                        
                        await this.s3Service.uploadDirectory(reportDir, s3ReportKeyPrefix, jobBucket);
                        this.logger.log(`[${runId}] Report directory contents uploaded to S3 prefix: ${s3ReportKeyPrefix}`);
                    } catch (uploadErr: any) {
                        this.logger.error(`[${runId}] Report upload failed from ${reportDir}: ${uploadErr.message}`);
                        s3Url = null;
                        overallSuccess = false;
                        finalError = finalError || `Report upload failed: ${uploadErr.message}`;
                    }
                }
            }
            
            // If no report found in the output directory, check for the default playwright-report location
            if (!reportFound) {
                const serviceRoot = process.cwd();
                const playwrightReportDir = path.join(serviceRoot, 'playwright-report');
                
                if (existsSync(playwrightReportDir)) {
                    this.logger.log(`[${runId}] Found HTML report in default location: ${playwrightReportDir}`);
                    try {
                        // Process the report files to fix trace URLs before uploading
                        await this._processReportFilesForS3(playwrightReportDir, runId, entityType);
                        
                        // Upload the playwright-report directory contents
                        await this.s3Service.uploadDirectory(playwrightReportDir, s3ReportKeyPrefix, jobBucket);
                        this.logger.log(`[${runId}] Report directory uploaded from default location to S3 prefix: ${s3ReportKeyPrefix}`);
                        reportFound = true;
                    } catch (uploadErr: any) {
                        this.logger.error(`[${runId}] Report upload failed from default location: ${uploadErr.message}`);
                        s3Url = null;
                        overallSuccess = false;
                        finalError = finalError || `Report upload failed: ${uploadErr.message}`;
                    }
                }
            }
            
            // If we still haven't found a report, log an error
            if (!reportFound) {
                this.logger.warn(`[${runId}] No HTML report found in any expected location. S3 URL might not point to a viewable report.`);
                if (existsSync(reportDir)) {
                    // If the reportDir exists but doesn't have index.html, upload it anyway for the artifacts
                    try {
                        // Process the report files to fix trace URLs before uploading
                        await this._processReportFilesForS3(reportDir, runId, entityType);
                        
                        await this.s3Service.uploadDirectory(reportDir, s3ReportKeyPrefix, jobBucket);
                        this.logger.log(`[${runId}] Uploaded test artifacts to S3 prefix: ${s3ReportKeyPrefix}`);
                    } catch (uploadErr: any) {
                        this.logger.error(`[${runId}] Artifacts upload failed: ${uploadErr.message}`);
                    }
                }
                
                // Keep s3Url pointing to where index.html *should* be. User might need to browse S3.
                this.logger.warn(`[${runId}] No valid HTML report found. S3 URL will point to an expected but possibly missing index.html.`);
            }
            
            finalResult = {
                jobId: runId,
                success: overallSuccess,
                error: finalError,
                reportUrl: s3Url,
                // Individual results are less meaningful with a combined report, 
                // but we can pass overall status for now.
                results: testScripts.map(ts => ({
                    testId: ts.id,
                    success: overallSuccess,
                    error: overallSuccess ? null : finalError,
                    reportUrl: s3Url, // Link to the combined job report
                })),
                timestamp,
                stdout: stdout_log,
                stderr: stderr_log,
            };
            
            // 6. Store final metadata in DB & publish status
            const finalStatus = overallSuccess ? 'completed' : 'failed';
            await this.dbService.storeReportMetadata({
                entityId: runId,
                entityType,
                reportPath: s3ReportKeyPrefix,
                status: finalStatus,
                s3Url: s3Url ?? undefined,
            });
            await this.redisService.publishJobStatus(runId, { 
                status: finalStatus, 
                reportPath: s3ReportKeyPrefix, 
                s3Url: s3Url ?? undefined, 
                error: finalError ?? undefined 
            });

        } catch (error) {
            this.logger.error(`[${runId}] Unhandled error during job execution: ${error.message}`, error.stack);
            const finalStatus = 'failed';
            // Attempt to mark DB as failed
            await this.dbService.storeReportMetadata({
                entityId: runId, entityType, reportPath: s3ReportKeyPrefix,
                status: finalStatus, s3Url: s3Url ?? undefined,
            }).catch(dbErr => this.logger.error(`[${runId}] Failed to update DB status on error: ${dbErr.message}`));
            
            // Publish failed status
            await this.redisService.publishJobStatus(runId, { 
                status: finalStatus, 
                error: error.message 
            }).catch(redisErr => this.logger.error(`[${runId}] Failed to publish error status: ${redisErr.message}`));

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
            this.logger.debug(`[${runId}] Cleaning up local run directory: ${runDir}`);
            await fs.rm(runDir, { recursive: true, force: true }).catch(err => {
                this.logger.warn(`[${runId}] Failed to cleanup local run directory ${runDir}: ${err.message}`);
            });
        }

        return finalResult;
    }

    /**
     * Execute a Playwright test using the native binary
     * @param runDir The base directory for this specific run where test files are located
     * @param isJob Whether this is a job execution (multiple tests)
     */
    private async _executePlaywrightNativeRunner(
        runDir: string,      // Directory containing the spec file(s) OR the single spec file for single tests
        isJob: boolean = false, // Flag to indicate if running multiple tests in a dir (job) vs single file
    ): Promise<PlaywrightExecutionResult> {
        const serviceRoot = process.cwd(); 
        const playwrightConfigPath = path.join(serviceRoot, 'playwright.config.js'); // Get absolute path to config
        const playwrightReportDir = path.join(serviceRoot, 'playwright-report');
        
        // Create a unique ID for this execution to prevent conflicts in parallel runs
        const executionId = crypto.randomUUID().substring(0, 8);

        try {
            let targetPath: string; // Path to run tests against (file or directory)

            if (isJob) {
                // For jobs, run all tests in the runDir
                targetPath = runDir;
                this.logger.log(`[Job Execution ${executionId}] Running tests in directory: ${targetPath}`);
            } else {
                // For single tests, find the specific test.spec.js file
                const files = await fs.readdir(runDir);
                const singleTestFile = files.find(file => file.endsWith('.spec.js')); 
                if (!singleTestFile) {
                    throw new Error(`No .spec.js file found in ${runDir} for single test execution. Files present: ${files.join(', ')}`);
                }
                targetPath = path.join(runDir, singleTestFile);
                this.logger.log(`[Single Test Execution ${executionId}] Running specific test file: ${targetPath}`);
            }
            
            // Add unique environment variables for this execution
            const envVars = {
                PLAYWRIGHT_TEST_DIR: runDir,
                CI: 'true',
                PLAYWRIGHT_EXECUTION_ID: executionId,
                // Create a unique artifacts folder for this execution
                PLAYWRIGHT_ARTIFACTS_DIR: path.join(runDir, `.artifacts-${executionId}`),
                // Add timestamp to prevent caching issues
                PLAYWRIGHT_TIMESTAMP: Date.now().toString()
            };
            
            this.logger.debug(`Executing playwright with execution ID: ${executionId}`);
            
            // Handle path differences between Windows and Unix-like systems
            let playwrightCliPath;
            if (isWindows) {
                // On Windows, use the .cmd extension
                playwrightCliPath = path.join(serviceRoot, 'node_modules', '.bin', 'playwright.cmd');
            } else {
                playwrightCliPath = path.join(serviceRoot, 'node_modules', '.bin', 'playwright');
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
            
            // Add unique output dir for this execution
            const outputDir = path.join(runDir, `report-${executionId}`);
            args.push(`--output=${outputDir}`);
            
            this.logger.log(`Running Playwright directly with command: ${command} ${args.join(' ')} and env vars:`, envVars);
            
            // Execute the command with environment variables, ensuring correct CWD
            const { success, stdout, stderr } = await this._executeCommand(command, args, {
                env: { ...process.env, ...envVars }, 
                cwd: serviceRoot, // Run playwright from service root
                shell: isWindows, // Use shell on Windows for proper command execution
            });
            
            // Improve error reporting
            let extractedError: string | null = null;
            if (!success) {
                // Prioritize stderr if it contains meaningful info, otherwise use stdout
                if (stderr && stderr.trim().length > 0 && !stderr.toLowerCase().includes('deprecationwarning')) {
                    extractedError = stderr.trim();
                } else if (stdout) {
                    // Look for common Playwright failure summaries in stdout
                    const failureMatch = stdout.match(/(\d+ failed)/);
                    if (failureMatch) {
                         extractedError = `${failureMatch[1]} - Check report/logs for details.`;
                    } else {
                        extractedError = 'Test execution failed. Check report/logs.'; // Fallback if stderr is empty/unhelpful
                    }
                } else {
                     extractedError = 'Test execution failed with no error message.'; // Absolute fallback
                }
            }
            
            return {
                success,
                error: extractedError, // Use the extracted error message
                stdout,
                stderr
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
     * Helper method to execute a command with proper error handling
     */
    private async _executeCommand(
        command: string, 
        args: string[], 
        options: { 
            env?: Record<string, string | undefined>; 
            cwd?: string; 
            shell?: boolean;
        } = {}
    ): Promise<{success: boolean, stdout: string, stderr: string}> {
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
    
                childProcess.on('error', (error) => {
                    this.logger.error(`Command error: ${error.message}`, error.stack);
                    resolve({
                        success: false,
                        stdout,
                        stderr: `Command error: ${error.message}\n${error.stack || ''}`
                    });
                });
    
                childProcess.on('close', (code) => {
                    this.logger.log(`Command exited with code: ${code}`);
                    resolve({
                        success: code === 0,
                        stdout,
                        stderr
                    });
                });
            } catch (error) {
                this.logger.error(`Failed to execute command: ${error.message}`, error.stack);
                resolve({
                    success: false,
                    stdout: '',
                    stderr: `Command setup error: ${error.message}\n${error.stack || ''}`
                });
            }
        });
    }

    /**
     * Fix trace file paths in HTML reports before uploading to S3
     * This prevents issues when absolute file paths are used in trace URLs
     */
    private async _processReportFilesForS3(reportDir: string, runId: string, entityType: string): Promise<void> {
        try {
            // Look for index.html in the report directory
            const indexPath = path.join(reportDir, 'index.html');
            if (!existsSync(indexPath)) {
                this.logger.warn(`No index.html found in ${reportDir}, skipping trace path processing`);
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
                        replacement: 'trace=../data'
                    },
                    // Pattern 2: Direct absolute path references to trace.zip
                    {
                        regex: /(["'])(https?:\/\/[^"']+\/[^"']+\/trace\.zip)(['"])/g,
                        replacement: '$1../data$3'
                    },
                    // Pattern 3: Absolute file paths starting with file:// or /Users, /home, etc.
                    {
                        regex: /(["'])(file:\/\/\/|\/(?:Users|home|var|tmp)[^"']+\/trace\.zip)(['"])/g,
                        replacement: '$1../data$3'
                    },
                    // Pattern 4: Windows absolute paths (C:\, D:\, etc.)
                    {
                        regex: /(["'])([A-Z]:\\[^"']+\\trace\.zip)(['"])/g,
                        replacement: '$1../data$3'
                    },
                    // Pattern 5: Trace directory paths (including custom trace-* directories)
                    {
                        regex: /(["'])(\.\/trace-[^"']+|\.playwright-artifacts-\d+\/traces)[^"']*(['"])/g,
                        replacement: '$1../data$3'
                    },
                    // Pattern 6: Any reference to .network files in absolute paths
                    {
                        regex: /(["'])(\/[^"']+\.network)(['"])/g,
                        replacement: '$1../data$3'
                    },
                    // Pattern 7: Any path with the runId in it - could be an artifact path
                    {
                        regex: new RegExp(`(["'])(\/[^"']*${runId}[^"']*)(['"])`, 'g'),
                        replacement: '$1../data$3'
                    }
                ];
                
                // Apply all patterns
                for (const pattern of patterns) {
                    const newContent = content.replace(pattern.regex, pattern.replacement);
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
                        const newSrc = originalSrc.replace(/\/[^/]+\/trace\.zip/, '../data');
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
            this.logger.error(`Error processing report files for S3: ${error.message}`, error.stack);
        }
    }

    /**
     * Inner function to handle test preparation
     */
    private async prepareSingleTest(testId: string, testScript: string, runDir: string): Promise<string> {
        try {
            this.logger.log(`[${testId}] Preparing test in directory: ${runDir}`);
            
            // Ensure proper trace configuration to avoid path issues
            const enhancedScript = ensureProperTraceConfiguration(testScript, testId);
            
            // Create the test file using our utility
            const { filePath } = await createDiscoverableTestFile(
                enhancedScript, 
                testId, 
                runDir
            );
            
            this.logger.log(`[${testId}] Created test file at: ${filePath}`);
            return filePath;
        } catch (error) {
            this.logger.error(`[${testId}] Failed to prepare test: ${error.message}`, error.stack);
            throw new Error(`Test preparation failed: ${error.message}`);
        }
    }
}
