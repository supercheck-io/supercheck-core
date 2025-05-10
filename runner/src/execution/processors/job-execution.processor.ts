import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { JOB_EXECUTION_QUEUE, TEST_EXECUTION_QUEUE, RUNNING_CAPACITY } from '../constants';
import { ExecutionService } from '../services/execution.service';
import { DbService } from '../services/db.service';
import { TestScript, JobExecutionTask, TestExecutionResult } from '../interfaces'; // Use updated interfaces
import { Redis } from 'ioredis';

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
    private readonly dbService: DbService
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