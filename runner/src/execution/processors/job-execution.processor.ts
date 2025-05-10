import { Processor } from '@nestjs/bullmq';
import { WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { JOB_EXECUTION_QUEUE } from '../constants'; // Use constants file
import { ExecutionService } from '../services/execution.service';
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
    private readonly dbService: DbService
  ) {
    super();
  }

  // Specify concurrency if needed, e.g., @Process({ concurrency: 2 })
  // @Process()
  async process(job: Job<JobExecutionTask>): Promise<TestExecutionResult> { // Renamed to process
    const { jobId, runId, originalJobId } = job.data; // Extract both jobId and runId
    const startTime = new Date(); // Record the start time for duration calculation
    
    this.logger.log(`[${runId}] Starting job execution for job ID: ${jobId} (Run: ${runId})`);

    // Update job status to 'pending' in the database for the original job entry
    if (originalJobId) {
      await this.dbService.updateJobStatus(originalJobId, 'pending')
        .catch(err => this.logger.error(`[${runId}] Failed to update job status to pending: ${err.message}`));
    }

    // Update job status to 'running' in the database when execution begins
    // Use originalJobId instead of runId for updating the jobs table
    if (originalJobId) {
      await this.dbService.updateJobStatus(originalJobId, 'running')
        .catch(err => this.logger.error(`[${runId}] Failed to update job status to running: ${err.message}`));
    }

    // Also update the run status to running
    await this.dbService.updateRunStatus(runId, 'running')
      .catch(err => this.logger.error(`[${runId}] Failed to update run status to running: ${err.message}`));

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
      
      // Calculate the job duration even for failed jobs
      const endTime = new Date();
      const durationMs = endTime.getTime() - startTime.getTime();
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
      
      // Status updates via Redis are now handled by QueueStatusService
      // through the Bull queue event listeners

      // Update job progress to indicate failure stage if applicable
      await job.updateProgress(100);
      
      // It's crucial to re-throw the error for BullMQ to mark the job as failed.
      // This will trigger the 'failed' event for the queue.
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