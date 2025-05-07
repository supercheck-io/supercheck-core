import { Processor } from '@nestjs/bullmq';
import { WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { JOB_EXECUTION_QUEUE } from '../constants'; // Use constants file
import { ExecutionService } from '../services/execution.service';
import { RedisService } from '../services/redis.service';
import { DbService } from '../services/db.service';
import { TestScript, JobExecutionTask, TestExecutionResult } from '../interfaces'; // Use updated interfaces

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
    private readonly redisService: RedisService,
    private readonly dbService: DbService
  ) {
    super();
  }

  // Specify concurrency if needed, e.g., @Process({ concurrency: 2 })
  // @Process()
  async process(job: Job<JobExecutionTask>): Promise<TestExecutionResult> { // Renamed to process
    const { jobId, runId, originalJobId } = job.data; // Extract both jobId and runId
    const startTime = new Date(); // Record the start time for duration calculation
    
    this.logger.log(`[${runId}] Processing job execution job ID: ${job.id} (${job.data.testScripts?.length || 0} tests)`);

    // Update job status to running in the database
    // Use originalJobId instead of runId for updating the jobs table
    if (originalJobId) {
      await this.dbService.updateJobStatus(originalJobId, 'running')
        .catch(err => this.logger.error(`[${runId}] Failed to update job status to running: ${err.message}`));
    }

    // Also update the run status to running
    await this.dbService.updateRunStatus(runId, 'running')
      .catch(err => this.logger.error(`[${runId}] Failed to update run status to running: ${err.message}`));

    // Notify observers that the job is running via Redis
    await this.redisService.publishJobStatus(runId, {
      status: 'running',
      runId,
      message: `Starting execution of ${job.data.testScripts?.length || 0} tests`
    }).catch(err => this.logger.error(`[${runId}] Failed to publish running status: ${err.message}`));

    // Add job progress updates if desired
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
      const durationStr = this.formatDuration(durationMs);
      const durationSeconds = Math.floor(durationMs / 1000);
      
      // Update the job status based on test results
      const finalStatus = result.success ? 'completed' : 'failed';
      try {
        if (originalJobId) {
          await this.dbService.updateJobStatus(originalJobId, finalStatus)
            .catch(err => this.logger.error(`[${runId}] Failed to update job status to ${finalStatus}: ${err.message}`));
        }
        
        // Update the run status with duration
        await this.dbService.updateRunStatus(runId, finalStatus, durationSeconds.toString())
          .catch(err => this.logger.error(`[${runId}] Failed to update run status to ${finalStatus}: ${err.message}`)); 
          
        // Include duration in the final status update
        await this.redisService.publishJobStatus(runId, {
          status: finalStatus,
          runId,
          success: result.success,
          results: result.results,
          s3Url: result.reportUrl,
          duration: durationStr // Include the formatted duration string for display
        });
      } catch (error) {
        this.logger.error(`[${runId}] Error publishing final status: ${error.message}`);
      }
      
      // The result object (TestExecutionResult) from the service is returned.
      // BullMQ will store this in Redis.
      return result; 
    } catch (error) {
      this.logger.error(`[${runId}] Job execution job ID: ${job.id} failed. Error: ${error.message}`, error.stack);
      
      // Calculate the job duration even for failed jobs
      const endTime = new Date();
      const durationMs = endTime.getTime() - startTime.getTime();
      const durationStr = this.formatDuration(durationMs);
      const durationSeconds = Math.floor(durationMs / 1000);
      
      // Update job status to failed in the database
      // Use originalJobId instead of runId for updating the jobs table
      if (originalJobId) {
        await this.dbService.updateJobStatus(originalJobId, 'failed')
          .catch(err => this.logger.error(`[${runId}] Failed to update job status on error: ${err.message}`));
      }

      // Update run status and duration for failed runs
      await this.dbService.updateRunStatus(runId, 'failed', durationSeconds.toString())
        .catch(err => this.logger.error(`[${runId}] Failed to update run status on error: ${err.message}`));
      
      // Publish error status with runId and duration
      await this.redisService.publishJobStatus(runId, { 
        status: 'failed',
        runId: runId,
        error: error.message,
        duration: durationStr
      }).catch(redisErr => this.logger.error(`[${runId}] Failed to publish error status: ${redisErr.message}`));
      
      // Update job progress to indicate failure stage if applicable
      await job.updateProgress(100);
      // It's crucial to re-throw the error for BullMQ to mark the job as failed.
      // The ExecutionService should have logged details and updated DB status.
      throw error; 
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
      return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
    }
  }
} 