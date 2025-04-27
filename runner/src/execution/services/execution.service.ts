import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn, execSync, exec } from 'child_process';
import * as fs from 'fs/promises';
import { existsSync, mkdirSync, writeFileSync, cpSync, readFileSync, rmSync } from 'fs';
import * as path from 'path';
import * as os from 'os';
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

        // Publish initial running status
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

            // 3. Write test file LOCALLY
            const testFileName = `test.spec.js`; // Simpler name
            const testFilePath = path.join(runDir, testFileName);
            
            // Write the user's code directly to the file
            const testContent = code; // Use the original code directly
            
            await fs.writeFile(testFilePath, testContent);
            this.logger.debug(`[${testId}] Test file written to ${testFilePath}`);

            // 4. Execute Playwright using the native runner helper
            this.logger.log(`[${testId}] Executing single test spec via Playwright native runner...`);
            // Pass runDir for test file and reportDir as the unified output
            const execResult = await this._executePlaywrightNativeRunner(runDir, reportDir);
            
            // Use the appropriate bucket for this entity type
            const testBucket = this.s3Service.getBucketForEntityType(entityType);
            
            // 5. Process results & Upload (Upload from local reportDir)
            if (execResult.success) {
                this.logger.log(`[${testId}] Playwright execution successful.`);
                try {
                    // 5a. Check if HTML report was generated
                    const htmlReportIndex = path.join(reportDir, 'index.html');
                    let reportFound = false;
                    
                    if (await fsExists(htmlReportIndex)) {
                        // Normal case: index.html exists in reportDir (successful runs)
                        this.logger.log(`[${testId}] HTML report found at ${htmlReportIndex}. Uploading to S3...`);
                        await this.s3Service.uploadDirectory(reportDir, s3ReportKeyPrefix, testBucket);
                        s3Url = this.s3Service.getBaseUrlForEntity(entityType, testId) + '/index.html';
                        reportFound = true;
                    } else {
                        // Check for default Playwright report in root directory first
                        const defaultPlaywrightReportDir = path.join(process.cwd(), 'playwright-report');
                        const defaultIndexHtml = path.join(defaultPlaywrightReportDir, 'index.html');
                        
                        if (existsSync(defaultIndexHtml)) {
                            this.logger.log(`[${testId}] Found HTML report in default location. Copying to test report directory...`);
                            try {
                                // Copy the Playwright report to our report directory
                                cpSync(defaultPlaywrightReportDir, reportDir, { recursive: true });
                                
                                // Upload the copied report
                                await this.s3Service.uploadDirectory(reportDir, s3ReportKeyPrefix, testBucket);
                                this.logger.log(`[${testId}] Copied and uploaded HTML report to S3 prefix: ${s3ReportKeyPrefix}`);
                                s3Url = this.s3Service.getBaseUrlForEntity(entityType, testId) + '/index.html';
                                reportFound = true;
                            } catch (copyErr) {
                                this.logger.error(`[${testId}] Failed to copy and upload default Playwright report: ${copyErr.message}`);
                                // Continue to check for test-* folders as fallback
                            }
                        }
                        
                        // Fallback: check for individual test report folders
                        if (!reportFound) {
                            this.logger.log(`[${testId}] index.html not found in ${reportDir}. Checking for individual test report folders...`);
                        
                            // Check if we have test-* folders that contain the individual test reports
                            const reportFiles = await fs.readdir(reportDir);
                            const testReportFolders = reportFiles.filter(name => name.startsWith('test-'));
                        
                            if (testReportFolders.length > 0) {
                                this.logger.log(`[${testId}] Found ${testReportFolders.length} test report folders. Creating simple index.html...`);
                                
                                // Create a simple index.html with links to each test report folder
                                let indexHtml = `
                                <!DOCTYPE html>
                                <html>
                                <head>
                                    <title>Test Report - ${testId}</title>
                                    <style>
                                        body {
                                            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                                            margin: 0;
                                            padding: 40px;
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
                                                color: #d4d4d4;
                                            }
                                            li {
                                                border-color: #444;
                                            }
                                            li:hover {
                                                background-color: #2d2d2d;
                                            }
                                            a {
                                                color: #6cb8ff;
                                            }
                                            .failed {
                                                color: #ff6b6b;
                                            }
                                            .passed {
                                                color: #69dd69;
                                            }
                                        }
                                        
                                        h1 {
                                            color: #333;
                                            margin-bottom: 1.5rem;
                                        }
                                        
                                        ul {
                                            list-style-type: none;
                                            padding: 0;
                                        }
                                        
                                        li {
                                            margin: 10px 0;
                                            padding: 16px;
                                            border: 1px solid #eee;
                                            border-radius: 6px;
                                        }
                                        
                                        li:hover {
                                            background-color: #f5f5f5;
                                        }
                                        
                                        a {
                                            color: #0066cc;
                                            text-decoration: none;
                                            padding: 4px 8px;
                                            margin-right: 4px;
                                            border-radius: 4px;
                                            display: inline-block;
                                        }
                                        
                                        a:hover {
                                            text-decoration: underline;
                                        }
                                        
                                        .failed {
                                            color: #cc0000;
                                        }
                                        
                                        .passed {
                                            color: #00cc00;
                                        }
                                    </style>
                                </head>
                                <body>
                                    <h1>Test Report for ${testId}</h1>
                                    <p>The following test reports are available:</p>
                                    <ul>
                                `;
                                
                                // Add links to each test report folder
                                for (const folder of testReportFolders) {
                                    const status = folder.includes('retry') ? 'failed' : 'passed';
                                    const statusClass = status === 'failed' ? 'failed' : 'passed';
                                    
                                    // Try to find key files in the folder
                                    const folderPath = path.join(reportDir, folder);
                                    const folderFiles = await fs.readdir(folderPath).catch(() => []);
                                    
                                    // Look for evidence files (screenshots, videos, traces)
                                    const screenshot = folderFiles.find(f => f.includes('failed') && f.endsWith('.png'));
                                    const video = folderFiles.find(f => f.endsWith('.webm'));
                                    const trace = folderFiles.find(f => f.endsWith('.zip'));
                                    
                                    indexHtml += `
                                        <li>
                                            <strong class="${statusClass}">${folder} (${status})</strong><br>
                                            ${screenshot ? `<a href="${folder}/${screenshot}">Screenshot</a> | ` : ''}
                                            ${video ? `<a href="${folder}/${video}">Video</a> | ` : ''}
                                            ${trace ? `<a href="${folder}/${trace}">Trace</a>` : ''}
                                        </li>
                                    `;
                                }
                                
                                indexHtml += `
                                    </ul>
                                </body>
                                </html>
                                `;
                                
                                // Write the index.html file
                                await fs.writeFile(htmlReportIndex, indexHtml);
                                this.logger.log(`[${testId}] Created index.html with links to ${testReportFolders.length} test reports.`);
                                
                                // Now upload the report directory
                                await this.s3Service.uploadDirectory(reportDir, s3ReportKeyPrefix, testBucket);
                                s3Url = this.s3Service.getBaseUrlForEntity(entityType, testId) + '/index.html';
                            } else {
                                this.logger.warn(`[${testId}] Final report directory (${reportDir}) or index.html not found after failed execution. Skipping upload.`);
                            }
                        }
                    }
                } catch (uploadError) {
                    this.logger.error(`[${testId}] 🔴 S3 upload failed: ${uploadError.message}`);
                    throw new Error(`S3 upload failed: ${uploadError.message}`);
                }
                
                // Set final result status
                finalResult = {
                    success: s3Url !== null, // Only true if we have a valid report URL
                    error: s3Url !== null ? null : "Failed to process and upload report",
                    reportUrl: s3Url,
                    testId,
                    stdout: execResult.stdout,
                    stderr: execResult.stderr,
                };
                
                // Update status
                const finalStatus = s3Url !== null ? 'completed' : 'failed';
                await this.redisService.publishTestStatus(testId, {
                    status: finalStatus,
                    reportPath: s3ReportKeyPrefix,
                    s3Url: s3Url
                });
                
                await this.dbService.storeReportMetadata({
                    entityId: testId, 
                    entityType, 
                    reportPath: s3ReportKeyPrefix,
                    status: finalStatus, 
                    s3Url: s3Url ?? undefined,
                });
            } else {
                this.logger.error(`[${testId}] Playwright execution failed: ${execResult.error}`);
                // let finalResult: TestResult | null = null; // REMOVED Initialization here
                // Even on failure, attempt to upload the local report directory
                try {
                   // Check if the report directory exists before trying upload
                   const indexHtmlPath = path.join(reportDir, 'index.html');
                   if (existsSync(indexHtmlPath)) { // Check specifically for index.html on failure too
                        await this.s3Service.uploadDirectory(reportDir, s3ReportKeyPrefix, testBucket);
                        this.logger.log(`[${testId}] Error report/artifacts uploaded to S3 prefix: ${s3ReportKeyPrefix}`);
                        // <<< ADDED: Set s3Url even on failure if upload succeeds
                        s3Url = this.s3Service.getBaseUrlForEntity(entityType, testId) + '/index.html'; 
                   } else {
                     // Check for default Playwright report in root directory
                     const defaultPlaywrightReportDir = path.join(process.cwd(), 'playwright-report');
                     const defaultIndexHtml = path.join(defaultPlaywrightReportDir, 'index.html');
                     
                     if (existsSync(defaultIndexHtml)) {
                       this.logger.log(`[${testId}] Found HTML report in default location. Copying to test report directory...`);
                       try {
                         // Copy the Playwright report to our report directory
                         cpSync(defaultPlaywrightReportDir, reportDir, { recursive: true });
                         
                         // Upload the copied report
                         await this.s3Service.uploadDirectory(reportDir, s3ReportKeyPrefix, testBucket);
                         this.logger.log(`[${testId}] Copied and uploaded HTML report to S3 prefix: ${s3ReportKeyPrefix}`);
                         s3Url = this.s3Service.getBaseUrlForEntity(entityType, testId) + '/index.html';
                       } catch (copyErr) {
                         this.logger.error(`[${testId}] Failed to copy and upload default Playwright report: ${copyErr.message}`);
                         s3Url = null;
                       }
                     } else {
                       this.logger.warn(`[${testId}] Final report directory (${reportDir}) or index.html not found after failed execution. Skipping upload.`);
                       s3Url = null; // Indicate report is not available
                     }
                   }
                } catch (uploadErr) {
                    this.logger.error(`[${testId}] Failed to upload error report/artifacts: ${uploadErr.message}`);
                    s3Url = null; // Indicate upload failure
                }
                
                // <<< MOVED: Update status *before* throwing the error
                // Publish failed status
                await this.redisService.publishTestStatus(testId, {
                    status: 'failed',
                    error: execResult.error || 'Playwright execution failed', // Use specific error
                    reportPath: s3ReportKeyPrefix,
                    s3Url: s3Url // Use final s3Url
                });
                await this.dbService.storeReportMetadata({
                    entityId: testId, entityType, reportPath: s3ReportKeyPrefix,
                    status: 'failed', s3Url: s3Url ?? undefined, // Use final s3Url
                });

                // Log stdout and stderr specifically on failure for better debugging
                if (execResult.stdout) {
                  this.logger.error(`[${testId}] Playwright stdout:\n--- STDOUT START ---\n${execResult.stdout}\n--- STDOUT END ---\n`);
                }
                if (execResult.stderr) {
                  this.logger.error(`[${testId}] Playwright stderr:\n--- STDERR START ---\n${execResult.stderr}\n--- STDERR END ---\n`);
                }
                
                // <<< ADDED: Throw error to trigger the main catch block and fail the job
                throw new Error(execResult.error || `Playwright execution failed for test ${testId}`);
            }

        } catch (error) {
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
        const { jobId, testScripts } = task;
        const runId = jobId; // Use jobId as the unique identifier for this run
        const entityType = 'job';
        this.logger.log(`[${runId}] Starting job execution with ${testScripts.length} tests.`);

        const runDir = path.join(this.baseLocalRunDir, runId);
        const reportDir = path.join(runDir, 'report');
        const playwrightReportDir = path.join(runDir, 'playwright-report'); // Native reporter output
        const s3ReportKeyPrefix = `test-results/jobs/${runId}/report`; // S3 prefix for the final report
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

            // 3. Prepare combined test spec file ONLY
            const combinedTestSpecPath = path.join(runDir, 'job.spec.js');
            let combinedScriptContent = `const { test, expect } = require('@playwright/test');\n\n`;
            for (const testScript of testScripts) {
                // Basic validation (can be enhanced)
                if (!testScript.script || typeof testScript.script !== 'string') {
                    this.logger.warn(`[${runId}] Skipping test ${testScript.id} due to missing or invalid script content.`);
                    continue;
                }
                // Corrected regex for removing import/require
                let scriptContent = testScript.script.replace(/import\s+{[^}]*}\s+from\s+[\'\"]@playwright\/test[\'\"];?/g, '');
                scriptContent = scriptContent.replace(/require\([\'\"]@playwright\/test[\'\"]\);?/g, '');
                
                // Add test definition
                const safeTestName = (testScript.name || `Test ${testScript.id}`).replace(/`/g, '\\\\`');
                combinedScriptContent += `\ntest(\`${safeTestName}\`, async ({ page }) => {\n`;
                combinedScriptContent += scriptContent;
                combinedScriptContent += `\n});\n`;
            }
            await fs.writeFile(combinedTestSpecPath, combinedScriptContent);
            this.logger.debug(`[${runId}] Combined test spec written to: ${combinedTestSpecPath}`);

            // 4. Execute the combined test using the native runner
            this.logger.log(`[${runId}] Executing combined job test spec via Playwright runner...`);
            // Set isJob parameter to true to use the job spec file
            const execResult = await this._executePlaywrightNativeRunner(runDir, reportDir, true);
            overallSuccess = execResult.success;
            stdout_log = execResult.stdout;
            stderr_log = execResult.stderr;
            finalError = execResult.error;
            
            // 5. Process result and upload report
            this.logger.log(`[${runId}] Playwright execution finished. Overall success: ${overallSuccess}.`);

            const jobBucket = this.s3Service.getBucketForEntityType(entityType);
            s3Url = this.s3Service.getBaseUrlForEntity(entityType, runId) + '/index.html'; // Point to the HTML report index

            if (existsSync(playwrightReportDir)) { // Check if the native report exists
                this.logger.log(`[${runId}] Playwright report found. Copying to final report directory and uploading...`);
                try {
                    // Copy native report (playwright-report) to final location (report)
                    cpSync(playwrightReportDir, reportDir, { recursive: true });
                    // Upload the final 'report' directory contents
                    await this.s3Service.uploadDirectory(reportDir, s3ReportKeyPrefix, jobBucket);
                    this.logger.log(`[${runId}] Combined report uploaded to S3 prefix: ${s3ReportKeyPrefix}`);
                } catch (uploadErr) {
                    this.logger.error(`[${runId}] Report copy/upload failed: ${uploadErr.message}`);
                    s3Url = null; // Nullify URL if upload failed
                    overallSuccess = false; // Mark as failed if report upload fails
                    finalError = finalError || `Report upload failed: ${uploadErr.message}`;
                }
            } else {
                 this.logger.warn(`[${runId}] Native Playwright report directory (${playwrightReportDir}) not found. Skipping S3 upload.`);
                 s3Url = null;
                 // Consider job failed if the report wasn't generated as expected, even if tests passed
                 if (overallSuccess) {
                    overallSuccess = false;
                    finalError = finalError || "Playwright report was not generated.";
                 }
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
     * @param outputDir The unified directory Playwright should use for all output (HTML report + artifacts)
     * @param isJob Whether this is a job execution (multiple tests)
     */
    private async _executePlaywrightNativeRunner(
        runDir: string,      // Directory containing the spec file(s)
        outputDir: string,   // Absolute path to the final output directory (needed for pre-creation)
        isJob: boolean = false, // Keep isJob flag for spec file selection
    ): Promise<PlaywrightExecutionResult> {
        const serviceRoot = process.cwd(); 
        const playwrightConfigPath = path.join(serviceRoot, 'playwright.config.js'); // Get absolute path to config

        try {
            // Find the correct test file in the runDir
            const files = await fs.readdir(runDir);
            const singleTestFile = files.find(file => file === 'test.spec.js'); // Look for the specific name
            const jobSpecFile = files.find(file => file === 'job.spec.js');
            const specFile = isJob 
                ? (jobSpecFile ? path.join(runDir, jobSpecFile) : null)
                : (singleTestFile ? path.join(runDir, singleTestFile) : null);
                
            if (!specFile) {
                throw new Error(`No test spec file found in ${runDir}. Files present: ${files.join(', ')}`);
            }
            this.logger.log(`Found test spec file: ${specFile}`);
            
            // Remove PLAYWRIGHT_OUTPUT_DIR env var
            const envVars = {
                PLAYWRIGHT_TEST_DIR: runDir, // Test file location
                CI: 'true' // <<< ADDED: Prevent interactive prompts like "Serving report..."
            };
            this.logger.debug('Executing playwright with CI=true');
            
            // --- Execute Playwright directly using node --- 
            const playwrightCliPath = path.join(serviceRoot, 'node_modules', '.bin', 'playwright');
            const nodeCommand = 'node'; // Explicitly use node
            const args = [
                playwrightCliPath, // Path to the playwright CLI script
                'test',
                specFile, // Pass the specific test file to run
                `--config=${playwrightConfigPath}`, // Provide absolute path to config
                '--reporter=html,list', // Use both HTML and list reporters
            ];
            
            this.logger.log(`Running Playwright directly with command: ${nodeCommand} ${args.join(' ')} and env vars:`, envVars);
            
            // Execute the command with environment variables, ensuring correct CWD
            const { success, stdout, stderr } = await this._executeCommand(nodeCommand, args, {
                env: { ...process.env, ...envVars }, // Ensure env vars are passed
                cwd: serviceRoot, // Run playwright from service root so default config output dir works
            });
            // --- End direct execution change ---
            
            // Playwright will output to its default dir (playwright-report at cwd: serviceRoot)
            this.logger.log(`Playwright finished. Default report location: ${path.join(serviceRoot, 'playwright-report')}`);
            
            return {
                success,
                error: success ? null : (stderr || 'Test execution failed with no error message'),
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
        } = {}
    ): Promise<{success: boolean, stdout: string, stderr: string}> {
        return new Promise((resolve) => {
            try {
                const childProcess = spawn(command, args, {
                    env: { ...process.env, ...(options.env || {}) }, 
                    cwd: options.cwd || process.cwd() 
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
     * Helper to escape HTML for safe insertion in the fallback report
     */
}
