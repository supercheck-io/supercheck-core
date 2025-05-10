import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { TEST_EXECUTION_QUEUE, JOB_EXECUTION_QUEUE, RUNNING_CAPACITY } from '../constants';
import { ExecutionService } from '../services/execution.service';
import { TestExecutionTask, TestResult } from '../interfaces';
import { Redis } from 'ioredis';

@Processor(TEST_EXECUTION_QUEUE)
export class TestExecutionProcessor extends WorkerHost {
  private readonly logger = new Logger(TestExecutionProcessor.name);

  constructor(private readonly executionService: ExecutionService) {
    super();
    this.logger.log(`[Constructor] TestExecutionProcessor instantiated.`);
  }

  @OnWorkerEvent('active')
  onActive(job: Job) {
    this.logger.log(`[Event:active] Job ${job.id} has started.`);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job, result: any) {
    this.logger.log(`[Event:completed] Job ${job.id} completed with result: ${JSON.stringify(result)}`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, error: Error) {
    const jobId = job?.id || 'unknown';
    this.logger.error(`[Event:failed] Job ${jobId} failed with error: ${error.message}`, error.stack);
  }
  
  @OnWorkerEvent('error')
  onError(error: Error) {
    this.logger.error(`[Event:error] Worker encountered an error: ${error.message}`, error.stack);
  }

  @OnWorkerEvent('ready')
  onReady() {
    // This indicates the underlying BullMQ worker is connected and ready
    this.logger.log('[Event:ready] Worker is connected to Redis and ready to process jobs.');
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

  async process(job: Job<TestExecutionTask>): Promise<TestResult> {
    const testId = job.data.testId;
    const startTime = new Date();
    this.logger.log(`[${testId}] Test execution job ID: ${job.id} received for processing`);
    
    // Check if this job should be processed based on running capacity
    const shouldProcess = await this.shouldProcessJob();
    if (!shouldProcess) {
      this.logger.log(`[${testId}] Test execution delayed - running capacity full (${RUNNING_CAPACITY})`);
      // Re-queue the job with a small delay (5 seconds)
      await job.moveToDelayed(Date.now() + 5000);
      throw new Error('Running capacity full, job delayed');
    }

    try {
      await job.updateProgress(10); 

      // Delegate the actual execution to the service
      const result = await this.executionService.runSingleTest(job.data);
      
      // Calculate execution duration
      const endTime = new Date();
      const durationMs = endTime.getTime() - startTime.getTime();
      const durationSeconds = Math.floor(durationMs / 1000);
      
      await job.updateProgress(100);
      this.logger.log(`[${testId}] Test execution job ID: ${job.id} completed. Success: ${result.success}, Duration: ${durationSeconds}s`);
      
      // The result object (TestResult) from the service is returned
      return result;
    } catch (error) {
      this.logger.error(`[${testId}] Test execution job ID: ${job.id} failed. Error: ${error.message}`, error.stack);
      await job.updateProgress(100);
      throw error instanceof Error ? error : new Error(String(error));
    }
  }
} 