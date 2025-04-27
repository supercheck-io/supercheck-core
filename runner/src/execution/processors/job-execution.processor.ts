import { Processor } from '@nestjs/bullmq';
import { WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { JOB_EXECUTION_QUEUE } from '../constants'; // Use constants file
import { ExecutionService } from '../services/execution.service';
import { RedisService } from '../services/redis.service';
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
    private readonly redisService: RedisService
  ) {
    super();
  }

  // Specify concurrency if needed, e.g., @Process({ concurrency: 2 })
  // @Process()
  async process(job: Job<JobExecutionTask>): Promise<TestExecutionResult> { // Renamed to process
    const { jobId } = job.data;
    this.logger.log(`[${jobId}] Processing job execution job ID: ${job.id} (${job.data.testScripts?.length || 0} tests)`);

    // Publish initial status
    await this.redisService.publishJobStatus(jobId, { 
      status: 'running', 
      message: `Starting execution of ${job.data.testScripts?.length || 0} tests` 
    });

    // Add job progress updates if desired
    await job.updateProgress(10);

    try {
      // Delegate the actual execution to the service
      // The service handles validation, writing files, execution, upload, DB updates
      const result = await this.executionService.runJob(job.data);

      await job.updateProgress(100);
      this.logger.log(`[${jobId}] Job execution job ID: ${job.id} completed. Overall Success: ${result.success}`);
      
      // Publish completion status
      await this.redisService.publishJobStatus(jobId, { 
        status: result.success ? 'completed' : 'failed',
        success: result.success,
        results: result.results,
        s3Url: result.reportUrl
      });
      
      // The result object (TestExecutionResult) from the service is returned.
      // BullMQ will store this in Redis.
      return result; 
    } catch (error) {
      this.logger.error(`[${jobId}] Job execution job ID: ${job.id} failed. Error: ${error.message}`, error.stack);
      
      // Publish error status
      await this.redisService.publishJobStatus(jobId, { 
        status: 'failed',
        error: error.message,
      }).catch(redisErr => this.logger.error(`[${jobId}] Failed to publish error status: ${redisErr.message}`));
      
      // Update job progress to indicate failure stage if applicable
      await job.updateProgress(100);
      // It's crucial to re-throw the error for BullMQ to mark the job as failed.
      // The ExecutionService should have logged details and updated DB status.
      throw error; 
    }
  }
} 