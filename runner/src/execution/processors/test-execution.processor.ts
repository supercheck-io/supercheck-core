import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { TEST_EXECUTION_QUEUE } from '../constants';
import { ExecutionService } from '../services/execution.service';
import { TestExecutionTask, TestResult } from '../interfaces';

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

  async process(job: Job<TestExecutionTask>): Promise<TestResult> {
    const { testId } = job.data;
    this.logger.log(`[${testId}] Processing test execution job ID: ${job.id}`);
    
    await job.updateProgress(10); 

    try {
      const result = await this.executionService.runSingleTest(job.data);
      
      await job.updateProgress(100);
      this.logger.log(`[${testId}] Test execution job ID: ${job.id} completed. Success: ${result.success}`);
      
      return result; 
    } catch (error) {
      this.logger.error(`[${testId}] Test execution job ID: ${job.id} failed. Error: ${error.message}`, error.stack);
      await job.updateProgress(100);
      throw error instanceof Error ? error : new Error(String(error));
    }
  }
} 