import { Injectable, Logger } from '@nestjs/common';
import { Queue, QueueEvents } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { JOB_EXECUTION_QUEUE, TEST_EXECUTION_QUEUE } from '../constants';
import { DbService } from './db.service';

/**
 * Queue Status Service - Centralized Bull Queue Status Management
 * 
 * This service manages status updates directly through Bull queues rather than
 * separate Redis pub/sub channels. This simplifies the architecture by:
 * 
 * 1. Using Bull's built-in event system for status tracking
 * 2. Leveraging Bull's existing Redis data with proper TTL settings
 * 3. Removing the need for separate Redis pub/sub channels
 * 
 * Clients can subscribe to Bull queue events directly through the existing APIs.
 */
@Injectable()
export class QueueStatusService {
  private readonly logger = new Logger(QueueStatusService.name);
  private jobQueueEvents: QueueEvents;
  private testQueueEvents: QueueEvents;

  constructor(
    @InjectQueue(JOB_EXECUTION_QUEUE) private jobQueue: Queue,
    @InjectQueue(TEST_EXECUTION_QUEUE) private testQueue: Queue,
    private dbService: DbService
  ) {
    this.initializeQueueListeners();
  }

  /**
   * Sets up listeners for Bull queue events to update database status
   */
  private initializeQueueListeners() {
    // Set up QueueEvents for job queue
    this.jobQueueEvents = new QueueEvents(JOB_EXECUTION_QUEUE, {
      connection: this.jobQueue.opts.connection
    });

    // Set up QueueEvents for test queue
    this.testQueueEvents = new QueueEvents(TEST_EXECUTION_QUEUE, {
      connection: this.testQueue.opts.connection
    });

    // Job queue event listeners
    this.jobQueueEvents.on('waiting', ({ jobId }) => {
      this.logger.debug(`Job ${jobId} is waiting`);
      // Optional: Update database status if needed
    });

    this.jobQueueEvents.on('active', async ({ jobId }) => {
      this.logger.debug(`Job ${jobId} is active`);
      const job = await this.jobQueue.getJob(jobId);
      if (job) {
        const { runId, originalJobId } = job.data;
        if (originalJobId) {
          await this.dbService.updateJobStatus(originalJobId, ['running'])
            .catch(err => this.logger.error(`[${runId}] Failed to update job status to running: ${err.message}`));
        }
        
        await this.dbService.updateRunStatus(runId, 'running')
          .catch(err => this.logger.error(`[${runId}] Failed to update run status to running: ${err.message}`));
      }
    });

    this.jobQueueEvents.on('completed', async ({ jobId, returnvalue }) => {
      this.logger.debug(`Job ${jobId} completed`);
      const job = await this.jobQueue.getJob(jobId);
      if (job) {
        const { runId, originalJobId } = job.data;
        
        // TypeScript-safe way to handle returnvalue
        const result = typeof returnvalue === 'object' && returnvalue !== null 
          ? returnvalue as Record<string, any>
          : {};
          
        const finalStatus = result.success === true ? 'passed' : 'failed';
        
        if (originalJobId) {
          const finalRunStatuses = await this.dbService.getRunStatusesForJob(originalJobId);
          await this.dbService.updateJobStatus(originalJobId, finalRunStatuses)
            .catch(err => this.logger.error(`[${runId}] Failed to update job status to ${finalStatus}: ${err.message}`));
        }
        
        // Calculate duration if available in the result
        let durationStr = '';
        if (result.duration !== undefined) {
          durationStr = String(result.duration);
        }
        
        await this.dbService.updateRunStatus(runId, finalStatus, durationStr)
          .catch(err => this.logger.error(`[${runId}] Failed to update run status to ${finalStatus}: ${err.message}`));
      }
    });

    this.jobQueueEvents.on('failed', async ({ jobId, failedReason }) => {
      this.logger.error(`Job ${jobId} failed: ${failedReason}`);
      const job = await this.jobQueue.getJob(jobId);
      if (job) {
        const { runId, originalJobId } = job.data;
        
        if (originalJobId) {
          await this.dbService.updateJobStatus(originalJobId, ['failed'])
            .catch(err => this.logger.error(`[${runId}] Failed to update job status on error: ${err.message}`));
        }
        
        await this.dbService.updateRunStatus(runId, 'failed')
          .catch(err => this.logger.error(`[${runId}] Failed to update run status on error: ${err.message}`));
      }
    });

    // Test queue event listeners
    this.testQueueEvents.on('waiting', ({ jobId }) => {
      this.logger.debug(`Test ${jobId} is waiting`);
      // Tests don't need database updates for waiting state
    });

    this.testQueueEvents.on('active', async ({ jobId }) => {
      this.logger.debug(`Test ${jobId} is active`);
      const job = await this.testQueue.getJob(jobId);
      if (job) {
        const { testId } = job.data;
        // Optional: Update test status in database if needed
        this.logger.debug(`Test ${testId} is now running`);
      }
    });

    this.testQueueEvents.on('completed', async ({ jobId, returnvalue }) => {
      this.logger.debug(`Test ${jobId} completed`);
      const job = await this.testQueue.getJob(jobId);
      if (job) {
        const { testId } = job.data;
        // Optional: Update test completion in database if needed
        this.logger.debug(`Test ${testId} completed`);
      }
    });

    this.testQueueEvents.on('failed', async ({ jobId, failedReason }) => {
      this.logger.error(`Test ${jobId} failed: ${failedReason}`);
      const job = await this.testQueue.getJob(jobId);
      if (job) {
        const { testId } = job.data;
        // Optional: Update test failure in database if needed
        this.logger.error(`Test ${testId} failed: ${failedReason}`);
      }
    });
  }
} 