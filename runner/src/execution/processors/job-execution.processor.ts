import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { JOB_EXECUTION_QUEUE } from '../constants';
import { ExecutionService } from '../services/execution.service';
import { DbService } from '../services/db.service';
import { TestScript, JobExecutionTask, TestExecutionResult } from '../interfaces';
import { NotificationService, NotificationPayload } from '../../notification/notification.service';
import { AlertStatus, AlertType } from '../../db/schema';

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

  // Specify concurrency if needed, e.g., @Process({ concurrency: 2 })
  // @Process()
  async process(job: Job<JobExecutionTask>): Promise<TestExecutionResult> { // Renamed to process
    const { runId, jobId: originalJobId } = job.data;
    const startTime = new Date();
    this.logger.log(`[${runId}] Job execution job ID: ${job.id} received for processing${originalJobId ? ` (job ${originalJobId})` : ''}`);
    
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
      
      // Update the run status with duration first
      await this.dbService.updateRunStatus(runId, finalStatus, durationSeconds.toString())
        .catch(err => this.logger.error(`[${runId}] Failed to update run status to ${finalStatus}: ${err.message}`));
      
      // Update job status based on all current run statuses (including the one we just updated)
      if (originalJobId) {
        const finalRunStatuses = await this.dbService.getRunStatusesForJob(originalJobId);
        await this.dbService.updateJobStatus(originalJobId, finalRunStatuses)
          .catch(err => this.logger.error(`[${runId}] Failed to update job status: ${err.message}`));
      } 
      
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
      
      // Update run status first
      await this.dbService.updateRunStatus(runId, errorStatus, '0')
        .catch(err => this.logger.error(`[${runId}] Failed to update run error status: ${err.message}`));
      
      // Update job status based on all current run statuses
      if (originalJobId) {
        const finalRunStatuses = await this.dbService.getRunStatusesForJob(originalJobId);
        await this.dbService.updateJobStatus(originalJobId, finalRunStatuses)
          .catch(err => this.logger.error(`[${runId}] Failed to update job error status: ${err.message}`));
      }
      
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
      // Get job configuration including alert settings - use originalJobId for database lookup
      const jobIdForLookup = jobData.originalJobId || jobData.jobId;
      const job = await this.dbService.getJobById(jobIdForLookup);
      if (!job || !job.alertConfig?.enabled) {
        this.logger.debug(`No alerts configured for job ${jobIdForLookup} - alertConfig: ${JSON.stringify(job?.alertConfig)}`);
        return; // No alerts configured
      }

      // Get notification providers
      const providers = await this.dbService.getNotificationProviders(job.alertConfig.notificationProviders);
      if (!providers || providers.length === 0) {
        this.logger.debug(`No notification providers configured for job ${jobIdForLookup}`);
        return; // No providers configured
      }

      // Get recent runs to check thresholds - use originalJobId for database lookup
      const recentRuns = await this.dbService.getRecentRunsForJob(jobIdForLookup, Math.max(job.alertConfig.failureThreshold, job.alertConfig.recoveryThreshold));
      
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
        this.logger.debug(`No notification conditions met for job ${jobIdForLookup} - status: ${finalStatus}, consecutive failures: ${consecutiveFailures}, consecutive successes: ${consecutiveSuccesses}`);
        return; // No notification conditions met
      }

      this.logger.log(`Sending notifications for job ${jobIdForLookup} with status ${finalStatus}`);

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
        message = `Job "${job.name}" timed out after ${durationSeconds} seconds. No ping received within expected interval.`;
      } else if (shouldNotifyFailure) {
        notificationType = 'job_failed';
        alertType = 'job_failed';
        severity = 'error';
        title = `Job Failed - ${job.name}`;
        message = `Job "${job.name}" has failed with ${failedTests} test failure${failedTests !== 1 ? 's' : ''}.`;
      } else if (shouldNotifySuccess) {
        notificationType = 'job_success';
        alertType = 'job_success';
        severity = 'success';
        title = `Job Completed - ${job.name}`;
        message = `Job "${job.name}" has completed successfully.`;
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
      const notificationResults = await this.notificationService.sendNotificationToMultipleProviders(
        providers,
        payload
      );

      this.logger.log(`Sent notifications for job ${jobIdForLookup}: ${notificationResults.success} success, ${notificationResults.failed} failed`);

      // Save alert history with proper status handling
      try {
        // Determine the correct status for each provider
        const alertStatus: AlertStatus = notificationResults.success > 0 ? 'sent' : 'failed';
        const alertErrorMessage = notificationResults.failed > 0 
          ? `${notificationResults.failed} of ${providers.length} notifications failed`
          : undefined;

        // Save alert history for this notification batch
        await this.dbService.saveAlertHistory(
          jobIdForLookup, // Use originalJobId for database storage
          alertType as AlertType,
          providers.map(p => p.name).join(', '),
          alertStatus,
          payload.message,
          alertErrorMessage,
        );
      } catch (historyError) {
        this.logger.error(`Failed to save alert history for job ${jobIdForLookup}: ${historyError.message}`);
      }
    } catch (error) {
      this.logger.error(`Failed to handle job notifications: ${error.message}`, error.stack);
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