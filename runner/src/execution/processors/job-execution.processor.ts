import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { JOB_EXECUTION_QUEUE, TEST_EXECUTION_QUEUE, RUNNING_CAPACITY } from '../constants';
import { ExecutionService } from '../services/execution.service';
import { DbService } from '../services/db.service';
import { TestScript, JobExecutionTask, TestExecutionResult } from '../interfaces'; // Use updated interfaces
import { Redis } from 'ioredis';
import { NotificationService, NotificationPayload } from '../../notification/notification.service';

// Define the expected structure of the job data
// Match this with TestScript and JobExecutionTask from original project
// interface TestScript {
//   id: string;
//   script: string;
//   name?: string;
// }

// interface JobExecutionTask {
//   jobId: string;
//   testScripts: TestScript[];
//   // Add other fields if necessary
// }

@Processor(JOB_EXECUTION_QUEUE)
export class JobExecutionProcessor extends WorkerHost {
  private readonly logger = new Logger(JobExecutionProcessor.name);

  constructor(
    private readonly executionService: ExecutionService,
    private readonly dbService: DbService,
    private readonly notificationService: NotificationService,
  ) {
    super();
    this.logger.log(`[Constructor] JobExecutionProcessor instantiated.`);
  }

  /**
   * Checks if a job should be processed based on current running capacity
   */
  private async shouldProcessJob(): Promise<boolean> {
    try {
      const runningCount = await this.getRunningJobCount();
      return runningCount < RUNNING_CAPACITY;
    } catch (error) {
      this.logger.error(`Error checking capacity: ${error.message}`);
      // If we can't determine, default to allowing processing
      return true;
    }
  }

  /**
   * Gets the current count of running jobs from Redis
   */
  private async getRunningJobCount(): Promise<number> {
    let redisClient: Redis | null = null;
    
    try {
      // Set up Redis connection
      const host = process.env.REDIS_HOST || 'localhost';
      const port = parseInt(process.env.REDIS_PORT || '6379');
      const password = process.env.REDIS_PASSWORD;
      
      redisClient = new Redis({
        host,
        port,
        password: password || undefined,
        maxRetriesPerRequest: null,
        connectTimeout: 3000,
        retryStrategy: (times: number) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        }
      });

      // Add event listeners for connection issues
      redisClient.on('error', (err) => {
        this.logger.error(`Redis connection error: ${err.message}`);
      });

      // Only count ACTIVE jobs (currently executing)
      const [activeJobs, activeTests] = await Promise.all([
        redisClient.llen(`bull:${JOB_EXECUTION_QUEUE}:active`),
        redisClient.llen(`bull:${TEST_EXECUTION_QUEUE}:active`)
      ]);
      
      // Running count is the sum of active jobs and tests
      return activeJobs + activeTests;
    } catch (error) {
      this.logger.error(`Failed to get running job count: ${error instanceof Error ? error.message : String(error)}`);
      return 0; // Return 0 on error to allow processing
    } finally {
      // Always close Redis connection
      if (redisClient) {
        try {
          await redisClient.quit();
        } catch (e) {
          // Silently ignore Redis quit errors
          this.logger.debug(`Redis disconnect error (safe to ignore): ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
  }

  // Specify concurrency if needed, e.g., @Process({ concurrency: 2 })
  // @Process()
  async process(job: Job<JobExecutionTask>): Promise<TestExecutionResult> { // Renamed to process
    const { runId, jobId: originalJobId } = job.data;
    const startTime = new Date();
    this.logger.log(`[${runId}] Job execution job ID: ${job.id} received for processing${originalJobId ? ` (job ${originalJobId})` : ''}`);
    
    // Check if this job should be processed based on running capacity
    const shouldProcess = await this.shouldProcessJob();
    if (!shouldProcess) {
      this.logger.log(`[${runId}] Job execution delayed - running capacity full (${RUNNING_CAPACITY})`);
      // Re-queue the job with a small delay (5 seconds)
      await job.moveToDelayed(Date.now() + 5000);
      throw new Error('Running capacity full, job delayed');
    }

    await job.updateProgress(10);

    try {
      // Delegate the actual execution to the service
      // The service handles validation, writing files, execution, upload, DB updates
      const result = await this.executionService.runJob(job.data);

      await job.updateProgress(100);
      this.logger.log(`[${runId}] Job execution job ID: ${job.id} completed. Overall Success: ${result.success}`);
      
      // Calculate execution duration
      const endTime = new Date();
      const durationMs = endTime.getTime() - startTime.getTime();
      const durationSeconds = Math.floor(durationMs / 1000);
      
      // Update the job status based on test results
      const finalStatus = result.success ? 'passed' : 'failed';
      
      // Update database directly
      if (originalJobId) {
        await this.dbService.updateJobStatus(originalJobId, finalStatus)
          .catch(err => this.logger.error(`[${runId}] Failed to update job status to ${finalStatus}: ${err.message}`));
      }
      
      // Update the run status with duration
      await this.dbService.updateRunStatus(runId, finalStatus, durationSeconds.toString())
        .catch(err => this.logger.error(`[${runId}] Failed to update run status to ${finalStatus}: ${err.message}`)); 
      
      // Status updates via Redis are now handled by QueueStatusService
      // through the Bull queue event listeners

      // Send notifications for job completion
      await this.handleJobNotifications(job.data, result, finalStatus, durationSeconds);

      // The result object (TestExecutionResult) from the service is returned.
      // BullMQ will store this in Redis and trigger the 'completed' event.
      return result; 
    } catch (error) {
      this.logger.error(`[${runId}] Job execution job ID: ${job.id} failed. Error: ${error.message}`, error.stack);
      
      // Update database with error status
      const errorStatus = 'failed';
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (originalJobId) {
        await this.dbService.updateJobStatus(originalJobId, errorStatus)
          .catch(err => this.logger.error(`[${runId}] Failed to update job error status: ${err.message}`));
      }
      
      await this.dbService.updateRunStatus(runId, errorStatus, '0')
        .catch(err => this.logger.error(`[${runId}] Failed to update run error status: ${err.message}`));
      
      // Status updates via Redis are now handled by QueueStatusService
      // through the Bull queue event listeners

      // Update job progress to indicate failure stage if applicable
      await job.updateProgress(100);
      
      // It's crucial to re-throw the error for BullMQ to mark the job as failed.
      // This will trigger the 'failed' event for the queue.
      throw error instanceof Error ? error : new Error(String(error)); 
    }
  }

  @OnWorkerEvent('ready')
  onReady() {
    // This indicates the underlying BullMQ worker is connected and ready
    this.logger.log('[Event:ready] Worker is connected to Redis and ready to process jobs.');
  }

  private async handleJobNotifications(jobData: JobExecutionTask, result: TestExecutionResult, finalStatus: string, durationSeconds: number) {
    try {
      // Get job configuration including alert settings
      const job = await this.dbService.getJobById(jobData.jobId);
      if (!job || !job.alertConfig?.enabled) {
        this.logger.debug(`No alerts configured for job ${jobData.jobId} - alertConfig: ${JSON.stringify(job?.alertConfig)}`);
        return; // No alerts configured
      }

      // Get notification providers
      const providers = await this.dbService.getNotificationProviders(job.alertConfig.notificationProviders);
      if (!providers || providers.length === 0) {
        this.logger.debug(`No notification providers configured for job ${jobData.jobId}`);
        return; // No providers configured
      }

      // Get recent runs to check thresholds
      const recentRuns = await this.dbService.getRecentRunsForJob(jobData.jobId, Math.max(job.alertConfig.failureThreshold, job.alertConfig.recoveryThreshold));
      
      // Calculate consecutive statuses
      let consecutiveFailures = 0;
      let consecutiveSuccesses = 0;
      
      // Count current run
      if (finalStatus === 'failed') {
        consecutiveFailures = 1;
      } else if (finalStatus === 'passed') {
        consecutiveSuccesses = 1;
      }
      
      // Count previous runs until we hit a different status
      for (const run of recentRuns) {
        if (finalStatus === 'failed' && run.status === 'failed') {
          consecutiveFailures++;
        } else if (finalStatus === 'failed') {
          break;
        } else if (finalStatus === 'passed' && run.status === 'passed') {
          consecutiveSuccesses++;
        } else if (finalStatus === 'passed') {
          break;
        }
      }

      // Determine if we should send notifications based on thresholds
      const shouldNotifyFailure = job.alertConfig.alertOnFailure && 
                                finalStatus === 'failed' && 
                                consecutiveFailures >= job.alertConfig.failureThreshold;
      
      const shouldNotifySuccess = job.alertConfig.alertOnSuccess && 
                                finalStatus === 'passed' && 
                                consecutiveSuccesses >= job.alertConfig.recoveryThreshold;
      
      const shouldNotifyTimeout = job.alertConfig.alertOnTimeout && finalStatus === 'timeout';

      if (!shouldNotifyFailure && !shouldNotifySuccess && !shouldNotifyTimeout) {
        this.logger.debug(`No notification conditions met for job ${jobData.jobId} - status: ${finalStatus}, consecutive failures: ${consecutiveFailures}, consecutive successes: ${consecutiveSuccesses}`);
        return; // No notification conditions met
      }

      this.logger.log(`Sending notifications for job ${jobData.jobId} with status ${finalStatus}`);

      // Calculate test counts from results
      const totalTests = result.results?.length || 0;
      const passedTests = result.results?.filter(r => r.success).length || 0;
      const failedTests = totalTests - passedTests;

      // Create notification payload
      let notificationType: NotificationPayload['type'];
      let alertType: string; // For database storage
      let severity: NotificationPayload['severity'];
      let title: string;
      let message: string;

      if (shouldNotifyTimeout) {
        notificationType = 'job_timeout';
        alertType = 'job_timeout';
        severity = 'warning';
        title = `Job Timeout - ${job.name}`;
        message = `Job ${job.name} timed out after ${durationSeconds} seconds`;
      } else if (shouldNotifyFailure) {
        notificationType = 'job_failed';
        alertType = 'job_failed';
        severity = 'error';
        title = `Job Failed - ${job.name}`;
        message = `Job ${job.name} has failed ${consecutiveFailures} time${consecutiveFailures > 1 ? 's' : ''} in a row. Latest run had ${failedTests} test failures.`;
      } else if (shouldNotifySuccess) {
        notificationType = 'job_success';
        alertType = 'job_success';
        severity = 'success';
        title = `Job Completed - ${job.name}`;
        message = `Job ${job.name} has completed successfully ${consecutiveSuccesses} time${consecutiveSuccesses > 1 ? 's' : ''} in a row. Latest run had ${passedTests} tests passed.`;
      } else {
        // This shouldn't happen since we return early if no conditions are met
        return;
      }

      const payload: NotificationPayload = {
        type: notificationType,
        title,
        message: job.alertConfig.customMessage || message,
        targetName: job.name,
        targetId: job.id,
        severity,
        timestamp: new Date(),
        metadata: {
          duration: durationSeconds,
          status: finalStatus,
          totalTests,
          passedTests,
          failedTests,
          runId: jobData.runId,
          consecutiveFailures,
          consecutiveSuccesses,
        },
      };

      // Send notifications
      const notificationResult = await this.notificationService.sendNotificationToMultipleProviders(providers, payload);
      this.logger.log(`Sent notifications for job ${job.id}: ${notificationResult.success} success, ${notificationResult.failed} failed`);
      
      // Save alert history
      try {
        const appBaseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
        const alertHistoryData = {
          type: alertType,
          message: payload.message,
          target: job.name,
          targetType: 'job' as const,
          jobId: job.id,
          provider: providers.map(p => p.type).join(', '),
          status: notificationResult.success > 0 ? 'sent' as const : 'failed' as const,
          errorMessage: notificationResult.failed > 0 ? `${notificationResult.failed} notifications failed` : undefined,
        };

        const response = await fetch(`${appBaseUrl}/api/alerts/history`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(alertHistoryData),
        });

        if (!response.ok) {
          this.logger.error(`Failed to save alert history: ${response.statusText}`);
        } else {
          this.logger.log(`Alert history saved for job ${job.id}`);
        }
      } catch (error) {
        this.logger.error(`Error saving alert history: ${error.message}`);
      }
    } catch (error) {
      this.logger.error(`Failed to send notifications for job ${jobData.jobId}: ${error.message}`, error.stack);
    }
  }

  /**
   * Formats duration in ms to a human-readable string
   * @param durationMs Duration in milliseconds
   * @returns Formatted duration string like "3s" or "1m 30s"
   */
  private formatDuration(durationMs: number): string {
    const seconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
} 